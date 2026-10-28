import { snapshotDir } from "@claude-code-aws/context-contract";

import { DEFAULT_TIMEOUT_MS } from "./refresh.js";
import { buildReport, renderConfigText, renderStatusText } from "./report.js";
import { loadStored, processEnv, refreshAndStore } from "./runtime.js";
import { purgeSnapshots } from "./store.js";

export const USAGE = `Usage: aws-context <command> [--json]

  status         Show the stored AWS context for this workspace (no network)
  refresh        Verify the active identity with STS GetCallerIdentity and store it
  config show    Show the effective configuration and warnings
  purge          Delete every stored context snapshot

Verification is read-only and never signs in, switches profile, or edits AWS configuration.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

/**
 * Runs one CLI command. Degraded states (no credentials, expired SSO, offline) are reported in the
 * output with exit code 0; only a usage error exits non-zero.
 */
export async function runCli(argv: readonly string[], projectDir: string): Promise<CliResult> {
  const json = argv.includes("--json");
  const words = argv.filter((word) => !word.startsWith("--"));
  const unknownFlags = argv.filter((word) => word.startsWith("--") && word !== "--json");
  const [command, sub] = words;
  if (unknownFlags.length > 0 || words.length > 2) return { exitCode: 2, stdout: USAGE };
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text,
  });

  if (command === "status" && sub === undefined) {
    const stored = await loadStored(projectDir);
    const report = buildReport(stored.snapshot, stored.config, new Date());
    return print(report, renderStatusText(report));
  }
  if (command === "refresh" && sub === undefined) {
    const outcome = await refreshAndStore(projectDir, DEFAULT_TIMEOUT_MS);
    const report = buildReport(outcome.snapshot, outcome.config, new Date());
    const note = outcome.writeFailed
      ? "\n\nThe result could not be saved, so the status line and UI will not show it."
      : "";
    return print({ ...report, saved: !outcome.writeFailed }, `${renderStatusText(report)}${note}`);
  }
  if (command === "config" && sub === "show") {
    const stored = await loadStored(projectDir);
    return print(
      {
        ttlMinutes: stored.config.ttlMinutes,
        maskAccountId: stored.config.maskAccountId,
        showProfile: stored.config.showProfile,
        showUser: stored.config.showUser,
        autoRefresh: stored.config.autoRefresh,
        userAccounts: stored.config.user?.accounts ?? {},
        projectAccounts: stored.config.project?.accounts ?? {},
        warnings: stored.config.warnings,
      },
      renderConfigText(stored.config),
    );
  }
  if (command === "purge" && sub === undefined) {
    const dir = snapshotDir(processEnv);
    const removed = dir === null ? 0 : purgeSnapshots(dir);
    return print({ removed }, `Removed ${removed} stored context snapshot(s).`);
  }
  return { exitCode: 2, stdout: USAGE };
}
