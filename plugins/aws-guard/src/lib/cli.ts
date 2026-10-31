import { evaluateBash, type EvaluateContext, type Verdict } from "./evaluate.js";
import { loadContext, processEnv } from "./runtime.js";

export const USAGE = `Usage: aws-guard <command> [--json]

  check [--mode <permission mode>] <command...>   Explain what the guard would decide for a shell
                                                  command. Executes nothing.
  rules                                           Show the effective configuration and warnings

The guard only asks or denies; it never allows, and it is a guardrail, not an enforcement boundary.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

function describe(verdict: Verdict): string {
  const lines = [
    `Decision:  ${verdict.decision === "none" ? "no decision (the normal permission flow applies)" : verdict.decision}`,
  ];
  if (verdict.code !== null) lines.push(`Code:      ${verdict.code}`);
  if (verdict.reason !== null) lines.push(`Reason:    ${verdict.reason}`);
  if (verdict.findings.length === 0) lines.push("No AWS command was found in the input.");
  for (const finding of verdict.findings) {
    const target = finding.target.emulator
      ? "local emulator"
      : finding.target.known
        ? `${finding.target.environment}, account ${finding.target.account}`
        : `not verified: ${finding.target.unknownBecause ?? "unknown"}`;
    lines.push(
      `- ${finding.summary}: ${finding.classification.class} (${finding.classification.code}); target ${target}`,
    );
  }
  return lines.join("\n");
}

function rulesText(context: EvaluateContext): string {
  const { config } = context;
  const lines = [
    `unattended:   ${config.unattended}`,
    `onUnverified: ${config.onUnverified}`,
    `mcpServers:   ${config.mcpServers.length === 0 ? "(none added)" : config.mcpServers.join(", ")}`,
    "",
    "Rules:",
    ...(config.rules.length === 0
      ? ["  (none; the built-in rules always apply)"]
      : config.rules.map(
          (rule) => `  ${rule.action}: ${JSON.stringify({ ...rule, action: undefined })}`,
        )),
  ];
  if (config.warnings.length > 0)
    lines.push("", "Warnings:", ...config.warnings.map((w) => `  - ${w}`));
  return lines.join("\n");
}

export async function runCli(argv: readonly string[], projectDir: string): Promise<CliResult> {
  const json = argv.includes("--json");
  const words = argv.filter((word) => word !== "--json");
  const [command, ...rest] = words;
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text,
  });

  if (command === "check") {
    let mode = "default";
    const parts = [...rest];
    if (parts[0] === "--mode") {
      mode = parts[1] ?? "default";
      parts.splice(0, 2);
    }
    const text = parts.join(" ").trim();
    if (text === "") return { exitCode: 2, stdout: USAGE };
    const context = await loadContext(processEnv, projectDir, mode);
    const verdict = evaluateBash(text, context);
    return print(verdict, describe(verdict));
  }
  if (command === "rules" && rest.length === 0) {
    const context = await loadContext(processEnv, projectDir, "default");
    return print(context.config, rulesText(context));
  }
  return { exitCode: 2, stdout: USAGE };
}
