import {
  type DecideContext,
  type Decision,
  decideClassified,
  decideInvocation,
  type Finding,
  type ReasonCode,
} from "./decide.js";
import { extractInvocations, mentionsAwsTool } from "./extract.js";
import { shorten } from "./redact.js";
import type { Invocation } from "./types.js";

/** Permission modes in which nobody may be available to answer a prompt. */
export const UNATTENDED_MODES: ReadonlySet<string> = new Set(["bypassPermissions", "dontAsk"]);

export interface Verdict {
  decision: Decision;
  code: ReasonCode | null;
  reason: string | null;
  findings: Finding[];
}

const RANK: Record<Decision, number> = { none: 0, ask: 1, deny: 2 };
const MAX_REASON = 700;

export interface EvaluateContext extends DecideContext {
  /** Claude Code's permission mode for this call. */
  mode: string;
}

function combine(findings: Finding[], unanalyzable: boolean, context: EvaluateContext): Verdict {
  let top: Finding | null = null;
  for (const finding of findings) {
    if (top === null || RANK[finding.decision] > RANK[top.decision]) top = finding;
  }
  let decision: Decision = top?.decision ?? "none";
  let code: ReasonCode | null = top?.code ?? null;
  let reason: string | null = top?.reason ?? null;
  if (decision === "none" && unanalyzable) {
    decision = "ask";
    code = "GUARD_UNANALYZABLE";
    reason =
      "aws-guard: this command mentions an AWS tool but builds or hides what it runs (a variable, a piped script, or deeply nested shells), so it cannot be checked. This is a guardrail, not an enforcement boundary: IAM and SCPs are.";
  }
  if (
    decision === "ask" &&
    UNATTENDED_MODES.has(context.mode) &&
    context.config.unattended === "deny"
  ) {
    const original = reason ?? "";
    decision = "deny";
    code = "GUARD_UNATTENDED";
    reason = `${original} It was blocked instead of asked because permission mode "${context.mode}" may have no one to answer. Run it yourself, or set "unattended": "ask" in your aws-guard configuration.`;
  }
  if (reason !== null && findings.length > 1) {
    const others = findings.filter(
      (finding) => finding !== top && finding.decision !== "none",
    ).length;
    if (others > 0)
      reason = `${reason} (${others} more AWS command(s) in this call also need attention.)`;
  }
  return {
    decision,
    code,
    reason: reason === null ? null : reason.slice(0, MAX_REASON),
    findings,
  };
}

/** Evaluates a Bash command. */
export function evaluateBash(command: string, context: EvaluateContext): Verdict {
  const extraction = extractInvocations(command);
  const findings = extraction.invocations.map((invocation) =>
    decideInvocation(invocation, context),
  );
  const unanalyzable =
    (extraction.unanalyzable || extraction.truncated) && mentionsAwsTool(command);
  return combine(findings, unanalyzable, context);
}

// MCP --------------------------------------------------------------------------------------

const AWS_SERVER = /aws|dsql|dynamodb|cloudformation|cdk/i;

/** True when an MCP tool name belongs to a server whose name suggests AWS. */
export function looksLikeAwsServer(toolName: string): boolean {
  const parts = splitMcpName(toolName);
  return parts !== null && AWS_SERVER.test(parts.server);
}
const READ_TOOL =
  /^(search|read|get|list|describe|recommend|retrieve|validate|check|analyze|compute|troubleshoot|cdk_best|source_db|generate_cost|readonly|query|dsql_(search|read|recommend|lint)|aws___(search|read|get|list|retrieve|suggest)|dynamodb_data_model|resolve|fetch|find|explain|estimate)/i;
const LOCAL_TOOL = /^(generate_resources|generate_data_access_layer)/i;
const DELETE_TOOL = /^(delete|remove|terminate|destroy|purge|drop)/i;
const CLI_FIELDS = ["cli_command", "command", "cmd"];

/** `mcp__<server>__<tool>` or `mcp__plugin_<plugin>_<server>__<tool>`. */
export function splitMcpName(name: string): { server: string; tool: string } | null {
  if (!name.startsWith("mcp__")) return null;
  const rest = name.slice(5);
  const index = rest.indexOf("__");
  if (index <= 0) return null;
  return { server: rest.slice(0, index), tool: rest.slice(index + 2) };
}

/** Evaluates an MCP tool call. Servers that are not AWS servers get no decision. */
export function evaluateMcp(
  toolName: string,
  toolInput: unknown,
  context: EvaluateContext,
): Verdict {
  const parts = splitMcpName(toolName);
  const quiet: Verdict = { decision: "none", code: null, reason: null, findings: [] };
  if (parts === null) return quiet;
  const known = AWS_SERVER.test(parts.server) || context.config.mcpServers.includes(parts.server);
  if (!known) return quiet;

  if (typeof toolInput === "object" && toolInput !== null) {
    const record = toolInput as Record<string, unknown>;
    for (const field of CLI_FIELDS) {
      const value = record[field];
      if (typeof value === "string" && /^\s*aws(\s|$)/.test(value))
        return evaluateBash(value, context);
    }
  }
  if (READ_TOOL.test(parts.tool) || LOCAL_TOOL.test(parts.tool)) return quiet;

  const invocation: Invocation = {
    tool: "mcp",
    args: [parts.server, parts.tool],
    dynamic: false,
    env: {},
    vaultProfile: null,
  };
  const cls = DELETE_TOOL.test(parts.tool)
    ? "delete"
    : /^(transact|execute|run|create|put|update|invoke|deploy|start|stop|write|apply|insert|modify)/i.test(
          parts.tool,
        )
      ? "write"
      : "unknown";
  const finding = decideClassified(invocation, { class: cls, code: "MCP_TOOL_RULE" }, context);
  return combine([finding], false, context);
}

export function describeCommand(command: string): string {
  return shorten(command);
}
