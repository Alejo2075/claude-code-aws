import { isValidRegion } from "@claude-code-aws/context-contract";

import { unavailable } from "./errors.js";
import {
  ACTIVE_STATUSES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type Request,
  runExplorer,
  STACK_STATUSES,
} from "./explorer.js";
import type { Api } from "./api.js";
import { renderReport } from "./render.js";
import type { Report } from "./types.js";

export const USAGE = `Usage: aws-explorer <command> [options]

  stacks [--status <status|active|all>[,...]]   List CloudFormation stacks
  stack <name>                                  Show one stack: status, parameters, outputs, tags
  resources <stack>                             List the resources of a stack
  events <stack>                                List a stack's events, newest first
  resource <type> <identifier>                  Read a resource's properties through Cloud Control
  resource --stack <stack> <logical id>         Same, looking the resource up in a stack

Options:
  --region <region>   Region to read (default: AWS_REGION or the profile's region)
  --limit <1-500>     Most items to list (default ${DEFAULT_LIMIT})
  --json              Machine-readable output

Read-only. It uses the credentials of your environment and never changes AWS or switches profile.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

export interface CliDeps {
  /** Region from the SDK's own resolution (AWS_REGION, then the profile). */
  sdkRegion: () => Promise<string | null>;
  /** `AWS_DEFAULT_REGION`, which the AWS CLI honors and the JavaScript SDK does not. */
  fallbackRegion: string | null;
  api: (region: string) => Api;
  contextAccount: () => string | null;
  now?: () => number;
}

const STACK_NAME = /^[A-Za-z][A-Za-z0-9-]{0,127}$/;
const STACK_ARN =
  /^arn:aws[a-z-]*:cloudformation:[a-z0-9-]+:\d{12}:stack\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+$/;
const LOGICAL_ID = /^[A-Za-z0-9]{1,255}$/;
const RESOURCE_TYPE = /^[A-Za-z0-9]{2,64}::[A-Za-z0-9]{2,64}::[A-Za-z0-9]{2,64}(::MODULE)?$/;
const MAX_IDENTIFIER = 1024;

function hasControlCharacter(text: string): boolean {
  return Array.from(text).some((char) => char.charCodeAt(0) < 0x20);
}

const VALUE_OPTIONS = new Set(["region", "limit", "status", "stack"]);

interface Parsed {
  words: string[];
  options: Map<string, string | true>;
  bad: string | null;
}

function parse(argv: readonly string[]): Parsed {
  const words: string[] = [];
  const options = new Map<string, string | true>();
  let bad: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--")) {
      const name = arg.slice(2);
      if (name === "json") options.set("json", true);
      else if (VALUE_OPTIONS.has(name)) {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) bad = `--${name} needs a value`;
        else {
          options.set(name, value);
          i += 1;
        }
      } else bad = `unknown option --${name}`;
    } else words.push(arg);
  }
  return { words, options, bad };
}

function invalid(message: string, json: boolean): CliResult {
  const report: Report = {
    header: null,
    data: null,
    unavailable: {
      ...unavailable("INVALID_INPUT"),
      message: `${unavailable("INVALID_INPUT").message} ${message}`,
    },
    partial: [],
    truncated: "none",
    limit: 0,
    redactedCount: 0,
    notes: [],
  };
  return { exitCode: 2, stdout: json ? JSON.stringify(report, null, 2) : `${message}\n\n${USAGE}` };
}

function stackName(value: string | undefined): string | null {
  return value !== undefined && (STACK_NAME.test(value) || STACK_ARN.test(value)) ? value : null;
}

/** An empty list means no filter: every stack, including deleted ones. */
function statusesOf(value: string | true | undefined): readonly string[] | "invalid" {
  if (value === undefined || value === "active") return ACTIVE_STATUSES;
  if (value === true) return "invalid";
  if (value === "all") return [];
  const requested = value.split(",");
  return requested.every((status) => (STACK_STATUSES as readonly string[]).includes(status))
    ? requested
    : "invalid";
}

/** Parses the command line, runs one read, and renders it. */
export async function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  const parsed = parse(argv);
  const json = parsed.options.has("json");
  if (parsed.bad !== null) return invalid(parsed.bad, json);
  const [verb, first, second, ...rest] = parsed.words;
  if (rest.length > 0) return invalid("too many arguments", json);

  const limitText = parsed.options.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitText !== undefined) {
    const value =
      typeof limitText === "string" && /^\d{1,4}$/.test(limitText) ? Number(limitText) : 0;
    if (value < 1 || value > MAX_LIMIT)
      return invalid(`--limit must be a whole number from 1 to ${MAX_LIMIT}`, json);
    limit = value;
  }
  const regionOption = parsed.options.get("region");
  if (
    regionOption !== undefined &&
    (typeof regionOption !== "string" || !isValidRegion(regionOption))
  ) {
    return invalid("--region is not a valid region name", json);
  }

  let request: Request;
  if (verb === "stacks" && first === undefined) {
    const statuses = statusesOf(parsed.options.get("status"));
    if (statuses === "invalid")
      return invalid("--status must be a stack status, active, or all", json);
    request = { verb: "stacks", statuses, limit };
  } else if (verb === "stack" && second === undefined) {
    const stack = stackName(first);
    if (stack === null) return invalid("give a valid stack name or ARN", json);
    request = { verb: "stack", stack };
  } else if ((verb === "resources" || verb === "events") && second === undefined) {
    const stack = stackName(first);
    if (stack === null) return invalid("give a valid stack name or ARN", json);
    request = { verb, stack, limit };
  } else if (verb === "resource") {
    const viaStack = parsed.options.get("stack");
    if (viaStack !== undefined) {
      const stack = typeof viaStack === "string" ? stackName(viaStack) : null;
      if (
        stack === null ||
        first === undefined ||
        second !== undefined ||
        !LOGICAL_ID.test(first)
      ) {
        return invalid("use: resource --stack <stack> <logical id>", json);
      }
      request = { verb: "resource-in-stack", stack, logicalId: first };
    } else {
      if (
        first === undefined ||
        second === undefined ||
        !RESOURCE_TYPE.test(first) ||
        second.length > MAX_IDENTIFIER ||
        hasControlCharacter(second)
      ) {
        return invalid("use: resource <type, such as AWS::S3::Bucket> <identifier>", json);
      }
      request = { verb: "resource", type: first, identifier: second };
    }
  } else if (verb !== undefined && ["stacks", "stack", "resources", "events"].includes(verb)) {
    return invalid("too many arguments", json);
  } else {
    return { exitCode: 2, stdout: USAGE };
  }

  const region =
    typeof regionOption === "string"
      ? regionOption
      : ((await deps.sdkRegion()) ?? deps.fallbackRegion);
  const report = await runExplorer({
    request,
    region,
    api: deps.api,
    contextAccount: deps.contextAccount(),
    ...(deps.now === undefined ? {} : { now: deps.now }),
  });
  return { exitCode: 0, stdout: json ? JSON.stringify(report, null, 2) : renderReport(report) };
}
