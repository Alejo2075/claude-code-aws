import { mentionsAwsTool } from "../lib/extract.js";
import { evaluateBash, evaluateMcp, looksLikeAwsServer, splitMcpName } from "../lib/evaluate.js";
import { runHook } from "../lib/hook-runtime.js";
import { currentProjectDir, loadContext, processEnv } from "../lib/runtime.js";

// The guard adds friction only: it prints `ask` or `deny`, and otherwise prints nothing so the
// user's own permission rules apply unchanged. It never prints `allow`. Hooks are a guardrail, not
// an enforcement boundary: IAM and SCPs are.
//
// It fails closed for what it covers: an internal error on a call that mentions an AWS tool exits
// 2 (blocks). A call that is plainly unrelated is let through, so a bug here cannot stop all work.
await runHook(
  async (input) => {
    const toolName = typeof input["tool_name"] === "string" ? input["tool_name"] : "";
    const toolInput = input["tool_input"];
    const mode =
      typeof input["permission_mode"] === "string" ? input["permission_mode"] : "default";

    let command: string | null = null;
    if (toolName === "Bash" && typeof toolInput === "object" && toolInput !== null) {
      const value = (toolInput as Record<string, unknown>)["command"];
      command = typeof value === "string" ? value : null;
      // Plainly unrelated: nothing to read, nothing to decide.
      if (command === null || !mentionsAwsTool(command)) return undefined;
    } else if (splitMcpName(toolName) === null) {
      return undefined;
    }

    let verdict;
    try {
      const context = await loadContext(processEnv, currentProjectDir(input.cwd), mode);
      verdict =
        command !== null
          ? evaluateBash(command, context)
          : evaluateMcp(toolName, toolInput, context);
    } catch (error) {
      // Covered calls fail closed; an unrelated MCP call is not held up by a bug here.
      if (command !== null || looksLikeAwsServer(toolName)) throw error;
      return undefined;
    }
    if (verdict.decision === "none" || verdict.reason === null) return undefined;
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: verdict.decision,
        permissionDecisionReason: verdict.reason,
      },
    };
  },
  { failClosed: true },
);
