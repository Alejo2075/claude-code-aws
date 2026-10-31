/**
 * Minimal runtime for exec-form command hooks: Node version guard, stdin parsing, and a single
 * JSON object on stdout. Contract: https://code.claude.com/docs/en/hooks
 *
 * Exit codes: 0 applies the printed JSON; 2 blocks the action on events that can block; any other
 * code is a non-blocking error. Policy hooks must pass `failClosed: true` so an internal error
 * blocks instead of silently allowing.
 */

export const MIN_NODE_MAJOR = 22;

export type HookInput = Record<string, unknown> & { hook_event_name: string; cwd: string };
export type HookOutput = Record<string, unknown>;

export interface RunHookOptions {
  /** Exit 2 (block) on internal errors instead of exit 1 (non-blocking). */
  failClosed?: boolean;
}

function exitWith(code: number, message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

export function nodeMajorVersion(version: string = process.versions.node): number {
  return Number.parseInt(version.split(".")[0] ?? "0", 10);
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export function parseHookInput(raw: string): HookInput {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("hook input is not a JSON object");
  }
  const input = parsed as Record<string, unknown>;
  if (typeof input["hook_event_name"] !== "string" || typeof input["cwd"] !== "string") {
    throw new Error("hook input lacks hook_event_name or cwd");
  }
  return input as HookInput;
}

export async function runHook(
  handler: (input: HookInput) => Promise<HookOutput | undefined> | HookOutput | undefined,
  options: RunHookOptions = {},
): Promise<void> {
  const errorCode = options.failClosed === true ? 2 : 1;
  if (nodeMajorVersion() < MIN_NODE_MAJOR) {
    exitWith(
      errorCode,
      `Node.js ${MIN_NODE_MAJOR} or later is required; found ${process.versions.node}.`,
    );
  }
  let output: HookOutput | undefined;
  try {
    output = await handler(parseHookInput(await readStdin()));
  } catch (error) {
    // Never echo the input or error payloads: they can contain command lines or tool output.
    const reason = error instanceof Error ? error.name : "UnknownError";
    exitWith(errorCode, `Hook failed internally (${reason}).`);
  }
  if (output !== undefined) process.stdout.write(JSON.stringify(output));
}
