/**
 * Builders for hook stdin payloads, following the common input fields documented at
 * https://code.claude.com/docs/en/hooks (checked against Claude Code 2.1.309).
 */
export interface CommonHookInput {
  session_id: string;
  prompt_id?: string;
  transcript_path: string;
  cwd: string;
  permission_mode: "default" | "plan" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions";
  hook_event_name: string;
  [key: string]: unknown;
}

export function commonInput(
  hookEventName: string,
  cwd: string,
  overrides: Partial<CommonHookInput> = {},
): CommonHookInput {
  return {
    session_id: "test-session",
    prompt_id: "00000000-0000-4000-8000-000000000000",
    transcript_path: "/tmp/test-transcript.jsonl",
    cwd,
    permission_mode: "default",
    hook_event_name: hookEventName,
    ...overrides,
  };
}

export function preToolUseInput(
  cwd: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  overrides: Partial<CommonHookInput> = {},
): CommonHookInput {
  return {
    ...commonInput("PreToolUse", cwd, overrides),
    tool_name: toolName,
    tool_input: toolInput,
    tool_use_id: "toolu_test",
  };
}

export function bashPreToolUseInput(cwd: string, command: string): CommonHookInput {
  return preToolUseInput(cwd, "Bash", { command, description: "test command", timeout: 120000 });
}

export function sessionStartInput(
  cwd: string,
  source: "startup" | "resume" | "clear" | "compact" | "fork" = "startup",
): CommonHookInput {
  return { ...commonInput("SessionStart", cwd), source };
}
