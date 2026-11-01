import { safeText } from "@claude-code-aws/safe-output";
import {
  findOnPath,
  findPackageBin,
  type RunOptions,
  type RunResult,
  runTool,
  scrubbedEnv,
} from "@claude-code-aws/tool-runner";

export type Runner = (options: RunOptions) => Promise<RunResult>;

export const DEPLOY_TIMEOUT_MS = 30 * 60 * 1000;

export interface ExecuteInput {
  root: string;
  env: Record<string, string | undefined>;
  stacks: readonly string[];
  run?: Runner;
  timeoutMs?: number;
}

export interface ExecuteResult {
  started: boolean;
  exitCode: number | null;
  timedOut: boolean;
  /** Redacted, bounded tail of the tool's output. */
  excerpt: string[];
  problem: string | null;
}

/**
 * Deploys the reviewed cloud assembly (`cdk deploy --app cdk.out`), so the user's app code is not run
 * again with credentials: what was hashed in the plan is what gets deployed. Never hotswap, never
 * a change that skips CloudFormation's own rollback. Credentials are the user's own, passed through.
 */
export async function executeDeploy(input: ExecuteInput): Promise<ExecuteResult> {
  const jsBin = findPackageBin(input.root, "aws-cdk", "cdk");
  const onPath = jsBin === null ? findOnPath("cdk", input.env["PATH"] ?? input.env["Path"]) : null;
  if (
    jsBin === null &&
    (onPath === null || (process.platform === "win32" && /\.(cmd|bat)$/i.test(onPath)))
  ) {
    return {
      started: false,
      exitCode: null,
      timedOut: false,
      excerpt: [],
      problem:
        "The CDK command line is not installed in the project. Add aws-cdk to its dependencies.",
    };
  }
  const args = [
    ...(jsBin === null ? [] : [jsBin]),
    "deploy",
    "--app",
    "cdk.out",
    "--exclusively",
    "--require-approval",
    "never",
    "--progress",
    "events",
    "--no-notices",
    "--no-version-reporting",
    ...input.stacks,
  ];
  const result = await (input.run ?? runTool)({
    command: jsBin === null ? (onPath as string) : process.execPath,
    args,
    root: input.root,
    env: scrubbedEnv(input.env, {
      allowAws: true,
      extra: { CI: "1", CDK_DISABLE_VERSION_CHECK: "1" },
    }),
    timeoutMs: input.timeoutMs ?? DEPLOY_TIMEOUT_MS,
    maxOutputBytes: 512 * 1024,
  });
  if (result.spawnError !== null) {
    return {
      started: false,
      exitCode: null,
      timedOut: false,
      excerpt: [],
      problem: `The deploy command could not be started (${result.spawnError}).`,
    };
  }
  const bounded = safeText(
    `${result.stdout}\n${result.stderr}`,
    { maxLines: 400, maxLineLength: 300, maxChars: 60_000 },
    { personalData: false },
  )
    .text.split("\n")
    .filter((line) => line.trim() !== "");
  return {
    started: true,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    excerpt: bounded.slice(-40),
    problem: null,
  };
}
