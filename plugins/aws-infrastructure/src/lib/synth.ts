// `cdk synth` runs the project's own code, which is repository content and untrusted. It runs here
// with an allowlisted environment (no AWS credentials or tokens), a private HOME so the SDK cannot
// find the user's credential files, no shell, a timeout, and bounded output. That reduces accidents;
// it is not a sandbox: the app can still read project files and use the network.
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { safeText } from "@claude-code-aws/safe-output";
import {
  findOnPath,
  findPackageBin,
  isInside,
  type RunOptions,
  type RunResult,
  runTool,
  scrubbedEnv,
} from "@claude-code-aws/tool-runner";

export type Runner = (options: RunOptions) => Promise<RunResult>;

export interface SynthOptions {
  root: string;
  env: Record<string, string | undefined>;
  /** Output directory, relative to the project. Defaults to `cdk.out`. */
  out?: string;
  stacks?: readonly string[];
  /** Allow context lookups: the app runs with the user's AWS credentials. */
  lookups?: boolean;
  timeoutMs?: number;
  run?: Runner;
}

export type SynthCode =
  | "NO_APP"
  | "NO_CDK"
  | "MISSING_DEPENDENCY"
  | "TYPESCRIPT_ERROR"
  | "NEEDS_LOOKUP"
  | "CYCLE"
  | "APP_ERROR"
  | "TIMEOUT"
  | "UNSAFE_PATH"
  | "INVALID_INPUT";

export interface Diagnostic {
  code: SynthCode;
  message: string;
  /** What to do next. */
  hint: string;
  /** A few redacted lines of the tool's own output. */
  excerpt: string[];
}

export interface SynthResult {
  ok: boolean;
  outDir: string | null;
  diagnostic: Diagnostic | null;
  lookups: boolean;
  durationMs: number;
}

export const DEFAULT_SYNTH_TIMEOUT_MS = 180_000;
const STACK_NAME = /^[A-Za-z][A-Za-z0-9-/]{0,127}$/;

interface Pattern {
  test: RegExp;
  code: SynthCode;
  message: string;
  hint: string;
}

const PATTERNS: Pattern[] = [
  {
    test: /--app is required|No app|cdk\.json.*(not found|ENOENT)/i,
    code: "NO_APP",
    message: "CDK does not know how to run the app.",
    hint: 'Add an "app" entry to cdk.json (for example "npx tsx bin/app.ts").',
  },
  {
    test: /Unable to resolve AWS account|Need to perform AWS calls|Cannot retrieve value from context provider|context lookup|lookup role/i,
    code: "NEEDS_LOOKUP",
    message:
      "The app looks up a value from AWS (a VPC, a hosted zone, an AMI, ...) and synth ran without credentials.",
    hint: "Re-run with --lookups to run the app with your AWS credentials, or commit cdk.context.json so synth needs no lookups.",
  },
  {
    test: /Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND/,
    code: "MISSING_DEPENDENCY",
    message: "The app imports a package that is not installed.",
    hint: "Install the project's dependencies with your package manager, then synth again.",
  },
  {
    test: /\bTS\d{4}:/,
    code: "TYPESCRIPT_ERROR",
    message: "The app has TypeScript errors.",
    hint: "Fix the errors listed below (file and line are in the excerpt).",
  },
  {
    test: /cyclic|circular dependenc|dependency cycle/i,
    code: "CYCLE",
    message: "Two stacks or resources depend on each other.",
    hint: "Break the cycle: move the shared resource to a third stack, or pass a name or ARN instead of the construct.",
  },
  {
    test: /There was an error while running|Error:|Unhandled|throw /,
    code: "APP_ERROR",
    message: "The app threw an error while building the stacks.",
    hint: "The excerpt shows the first lines of the error; the construct path is usually named there.",
  },
];

/** Reads the tool's output for the usual causes of a failed synth. */
export function diagnose(result: RunResult): Diagnostic {
  const raw = `${result.stderr}\n${result.stdout}`;
  const pattern = PATTERNS.find((candidate) => candidate.test.test(raw));
  const excerpt = safeText(raw, { maxLines: 12, maxLineLength: 240 })
    .text.split("\n")
    .filter((line) => line.trim() !== "");
  if (result.timedOut) {
    return {
      code: "TIMEOUT",
      message: "Synth did not finish in time.",
      hint: "Check for an app that never exits (an open handle or a lookup that hangs), or raise the time limit.",
      excerpt,
    };
  }
  return pattern === undefined
    ? {
        code: "APP_ERROR",
        message: `CDK exited with code ${result.exitCode ?? "none"}.`,
        hint: "The excerpt shows the start of its output.",
        excerpt,
      }
    : { code: pattern.code, message: pattern.message, hint: pattern.hint, excerpt };
}

/** Runs `cdk synth` for the project. Never throws; every failure is a diagnostic. */
export async function synth(options: SynthOptions): Promise<SynthResult> {
  const started = Date.now();
  const lookups = options.lookups === true;
  const fail = (diagnostic: Diagnostic): SynthResult => ({
    ok: false,
    outDir: null,
    diagnostic,
    lookups,
    durationMs: Date.now() - started,
  });
  const out = options.out ?? "cdk.out";
  const outDir = resolve(options.root, out);
  if (!isInside(options.root, outDir)) {
    return fail({
      code: "UNSAFE_PATH",
      message: "The output directory is outside the project.",
      hint: "Use a directory inside the project.",
      excerpt: [],
    });
  }
  for (const stack of options.stacks ?? []) {
    if (!STACK_NAME.test(stack)) {
      return fail({
        code: "INVALID_INPUT",
        message: "A stack name is not valid.",
        hint: "Use the names `inspect` shows.",
        excerpt: [],
      });
    }
  }
  if (!existsSync(join(options.root, "cdk.json"))) {
    return fail({
      code: "NO_APP",
      message: "There is no cdk.json in the project directory.",
      hint: 'Run from the CDK app\'s directory, or create cdk.json with an "app" entry.',
      excerpt: [],
    });
  }
  // Prefer the project's own aws-cdk, run with node: no shell, the same on every platform.
  const jsBin = findPackageBin(options.root, "aws-cdk", "cdk");
  const onPath =
    jsBin === null ? findOnPath("cdk", options.env["PATH"] ?? options.env["Path"]) : null;
  const unusable = onPath !== null && process.platform === "win32" && /\.(cmd|bat)$/i.test(onPath);
  if (jsBin === null && (onPath === null || unusable)) {
    return fail({
      code: "NO_CDK",
      message: unusable
        ? "Only a Windows command shim for CDK was found, and this tool does not run shims."
        : "The CDK command line is not installed.",
      hint: "Add it to the project (`npm install --save-dev aws-cdk`) so it can be run directly.",
      excerpt: [],
    });
  }
  const command = jsBin === null ? (onPath as string) : process.execPath;
  const prefix = jsBin === null ? [] : [jsBin];

  // Without lookups the app gets a private, empty HOME so nothing in the user's profile is readable.
  const privateHome = lookups ? null : mkdtempSync(join(tmpdir(), "aws-infrastructure-home-"));
  const env = scrubbedEnv(options.env, {
    allowAws: lookups,
    extra: {
      CI: "1",
      CDK_DISABLE_VERSION_CHECK: "1",
      JSII_SILENCE_WARNING_UNTESTED_NODE_VERSION: "1",
      ...(privateHome === null
        ? {}
        : {
            HOME: privateHome,
            USERPROFILE: privateHome,
            AWS_EC2_METADATA_DISABLED: "true",
            AWS_CONFIG_FILE: join(privateHome, "config"),
            AWS_SHARED_CREDENTIALS_FILE: join(privateHome, "credentials"),
          }),
    },
  });
  const args = [
    ...prefix,
    "synth",
    "--quiet",
    "--no-version-reporting",
    "--no-notices",
    "--output",
    out,
    ...(lookups ? [] : ["--no-lookups"]),
    ...(options.stacks ?? []),
  ];
  try {
    const result = await (options.run ?? runTool)({
      command,
      args,
      root: options.root,
      env,
      timeoutMs: options.timeoutMs ?? DEFAULT_SYNTH_TIMEOUT_MS,
      maxOutputBytes: 256 * 1024,
    });
    if (result.spawnError !== null) {
      return fail({
        code: "NO_CDK",
        message: "The CDK command could not be started.",
        hint: `The system reported ${result.spawnError}. Reinstall aws-cdk.`,
        excerpt: [],
      });
    }
    if (result.exitCode !== 0 || result.timedOut) return fail(diagnose(result));
    return { ok: true, outDir, diagnostic: null, lookups, durationMs: Date.now() - started };
  } finally {
    if (privateHome !== null) rmSync(privateHome, { recursive: true, force: true });
  }
}
