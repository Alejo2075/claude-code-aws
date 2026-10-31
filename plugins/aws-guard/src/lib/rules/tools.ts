// Classification of the other AWS-affecting tools a developer runs from the shell. Same stance as
// the `aws` rules: recognized read and local verbs are quiet, recognized changes are classified,
// and everything else is `unknown`, which is treated as a change.
import { optionValue, type Parsed, parseArgs } from "../args.js";
import type { Classification, OpClass } from "../types.js";
import { classifyAws } from "./aws.js";

/** Tool names this guard recognizes. */
export const AWS_TOOLS: ReadonlySet<string> = new Set([
  "aws",
  "cdk",
  "sam",
  "terraform",
  "tofu",
  "terragrunt",
  "eksctl",
  "serverless",
  "sls",
  "pulumi",
  "copilot",
]);

const result = (cls: OpClass, code: string): Classification => ({ class: cls, code });

function fromTable(
  tool: string,
  verb: string | undefined,
  table: Record<string, OpClass>,
): Classification {
  if (verb === undefined) return result("read", `${tool.toUpperCase()}_NO_COMMAND`);
  const cls = table[verb];
  return cls === undefined
    ? result("unknown", `${tool.toUpperCase()}_UNKNOWN_COMMAND`)
    : result(cls, `${tool.toUpperCase()}_COMMAND`);
}

const CDK_VALUE_OPTIONS = new Set([
  "app",
  "a",
  "context",
  "c",
  "profile",
  "role-arn",
  "r",
  "output",
  "o",
  "plugin",
  "p",
  "toolkit-stack-name",
  "build",
  "proxy",
  "ca-bundle-path",
  "qualifier",
  "bootstrap-bucket-name",
  "cloudformation-execution-policies",
  "template",
  "outputs-file",
  "require-approval",
  "parameters",
  "tags",
  "notification-arns",
  "progress",
  "change-set-name",
  "concurrency",
  "exclusively",
  "method",
  "m",
]);

const CDK: Record<string, OpClass> = {
  ls: "read",
  list: "read",
  synth: "read",
  synthesize: "read",
  diff: "read",
  doctor: "read",
  docs: "read",
  doc: "read",
  context: "read",
  notices: "read",
  metadata: "read",
  acknowledge: "read",
  ack: "read",
  version: "read",
  init: "local",
  migrate: "local",
  deploy: "write",
  bootstrap: "write",
  import: "write",
  watch: "write",
  publish: "write",
  refactor: "write",
  gc: "delete",
  destroy: "destructive",
};

const SAM: Record<string, OpClass> = {
  validate: "read",
  list: "read",
  logs: "read",
  traces: "read",
  build: "local",
  local: "local",
  init: "local",
  package: "write",
  publish: "write",
  deploy: "write",
  sync: "write",
  pipeline: "write",
  remote: "write",
  delete: "destructive",
};

const TERRAFORM: Record<string, OpClass> = {
  init: "local",
  fmt: "local",
  validate: "read",
  version: "read",
  providers: "read",
  graph: "read",
  output: "read",
  show: "read",
  console: "read",
  get: "local",
  plan: "read",
  test: "read",
  login: "local",
  logout: "local",
  apply: "write",
  import: "write",
  taint: "write",
  untaint: "write",
  refresh: "write",
  "force-unlock": "write",
  destroy: "destructive",
};

const EKSCTL: Record<string, OpClass> = {
  get: "read",
  version: "read",
  info: "read",
  utils: "write",
  create: "write",
  upgrade: "write",
  scale: "write",
  set: "write",
  enable: "write",
  disable: "write",
  associate: "write",
  update: "write",
  drain: "write",
  cordon: "write",
  uncordon: "write",
  anywhere: "write",
  delete: "destructive",
};

const SERVERLESS: Record<string, OpClass> = {
  package: "local",
  print: "local",
  info: "read",
  logs: "read",
  metrics: "read",
  plugin: "local",
  config: "local",
  offline: "local",
  invoke: "write",
  deploy: "write",
  rollback: "write",
  login: "local",
  remove: "destructive",
};

const PULUMI: Record<string, OpClass> = {
  preview: "read",
  whoami: "read",
  version: "read",
  about: "read",
  logs: "read",
  history: "read",
  config: "local",
  new: "local",
  login: "local",
  logout: "local",
  up: "write",
  refresh: "write",
  import: "write",
  cancel: "write",
  state: "write",
  destroy: "destructive",
};

const COPILOT: Record<string, OpClass> = {
  ls: "read",
  show: "read",
  status: "read",
  logs: "read",
  package: "local",
  init: "write",
  deploy: "write",
  run: "write",
  delete: "destructive",
};

function classifyTerraform(tool: string, parsed: Parsed): Classification {
  const [command, sub] = parsed.positionals;
  if (command === "apply" && (parsed.options.has("destroy") || sub === "-destroy")) {
    return result("destructive", `${tool.toUpperCase()}_APPLY_DESTROY`);
  }
  if (command === "state") {
    if (sub === "list" || sub === "show" || sub === "pull")
      return result("read", "TERRAFORM_STATE_READ");
    if (sub === "rm") return result("destructive", "TERRAFORM_STATE_REMOVE");
    return result("write", "TERRAFORM_STATE_WRITE");
  }
  if (command === "workspace") {
    if (sub === "list" || sub === "show") return result("read", "TERRAFORM_WORKSPACE_READ");
    if (sub === "delete") return result("destructive", "TERRAFORM_WORKSPACE_DELETE");
    return result("local", "TERRAFORM_WORKSPACE_LOCAL");
  }
  return fromTable(tool, command, TERRAFORM);
}

/** Classifies the arguments that follow `tool`. `dynamic` means some words are not known. */
export function classifyTool(
  tool: string,
  args: readonly string[],
  dynamic: boolean,
): Classification {
  switch (tool) {
    case "aws":
      return classifyAws(args, dynamic);
    case "cdk": {
      const parsed = parseArgs(args, CDK_VALUE_OPTIONS);
      // `cdk diff` defaults to --method=auto, which creates a CloudFormation change set in the
      // account (and uses the deploy role). Only the template-only methods are reads.
      if (parsed.positionals[0] === "diff") {
        const method = optionValue(parsed, "method") ?? optionValue(parsed, "m");
        const templateOnly =
          method === "template" ||
          parsed.options.has("no-change-set") ||
          parsed.options.has("template");
        return templateOnly
          ? result("read", "CDK_DIFF_TEMPLATE")
          : result("write", "CDK_DIFF_CHANGE_SET");
      }
      return fromTable("cdk", parsed.positionals[0], CDK);
    }
    case "sam": {
      const parsed = parseArgs(
        args,
        new Set([
          "profile",
          "region",
          "config-file",
          "config-env",
          "template",
          "template-file",
          "t",
        ]),
      );
      return fromTable("sam", parsed.positionals[0], SAM);
    }
    case "terraform":
    case "tofu": {
      const filtered = args.filter((arg) => !arg.startsWith("-chdir="));
      return classifyTerraform(tool, parseArgs(filtered, new Set()));
    }
    case "terragrunt": {
      const filtered = args.filter(
        (arg) => !arg.startsWith("--terragrunt-") && !arg.startsWith("-chdir="),
      );
      const parsed = parseArgs(filtered, new Set());
      parsed.positionals = parsed.positionals.filter(
        (word) => word !== "run-all" && word !== "run",
      );
      return classifyTerraform(tool, parsed);
    }
    case "eksctl": {
      const parsed = parseArgs(args, new Set(["profile", "region", "name", "cluster", "n", "f"]));
      return fromTable("eksctl", parsed.positionals[0], EKSCTL);
    }
    case "serverless":
    case "sls": {
      const parsed = parseArgs(
        args,
        new Set(["stage", "s", "region", "r", "aws-profile", "config", "c"]),
      );
      if (parsed.positionals[0] === "invoke" && parsed.positionals[1] === "local") {
        return result("local", "SERVERLESS_INVOKE_LOCAL");
      }
      return fromTable("serverless", parsed.positionals[0], SERVERLESS);
    }
    case "pulumi": {
      const parsed = parseArgs(args, new Set(["stack", "s", "cwd", "C"]));
      const [command, sub] = parsed.positionals;
      if (command === "stack" && (sub === "rm" || sub === "remove"))
        return result("destructive", "PULUMI_STACK_REMOVE");
      if (command === "stack") return result("read", "PULUMI_STACK_READ");
      return fromTable("pulumi", command, PULUMI);
    }
    case "copilot": {
      const parsed = parseArgs(args, new Set(["name", "n", "app", "a", "env", "e", "profile"]));
      const verb = parsed.positionals.find((word) => word in COPILOT);
      return fromTable("copilot", verb, COPILOT);
    }
    default:
      return result("unknown", "TOOL_UNKNOWN");
  }
}
