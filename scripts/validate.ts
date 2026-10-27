// Runs `claude plugin validate --strict` on the catalog and on every plugin directory.
// The only tolerated finding is the empty-catalog warning, which applies until the first release.
import { relative } from "node:path";

import { fail, listPlugins, REPO_ROOT, runClaude } from "./lib/workspace.js";

interface Finding {
  path?: string;
  message: string;
}

interface ValidateReport {
  success: boolean;
  manifest?: { errors: Finding[]; warnings: Finding[] } | null;
  contents?: { file?: string; errors?: Finding[]; warnings?: Finding[] }[];
}

const TOLERATED = ["Marketplace has no plugins defined"];

function validate(target: string): string[] {
  const result = runClaude(["plugin", "validate", target, "--strict", "--json"], {
    cwd: REPO_ROOT,
  });
  if (result.status === 2 || result.stdout.trim() === "") {
    return [`claude plugin validate crashed for ${target}: ${result.stderr.trim()}`];
  }
  const report = JSON.parse(result.stdout) as ValidateReport;
  const findings: Finding[] = [
    ...(report.manifest?.errors ?? []),
    ...(report.manifest?.warnings ?? []),
    ...(report.contents ?? []).flatMap((item) => [
      ...(item.errors ?? []),
      ...(item.warnings ?? []),
    ]),
  ];
  const blocking = findings.filter((finding) => !TOLERATED.includes(finding.message));
  if (report.success || (findings.length > 0 && blocking.length === 0)) return [];
  if (blocking.length === 0)
    return [`validation failed for ${target} without findings: ${result.stdout}`];
  return blocking.map(
    (finding) => `${relative(REPO_ROOT, target) || "."}: ${finding.path ?? ""} ${finding.message}`,
  );
}

const targets = [REPO_ROOT, ...listPlugins().map((plugin) => plugin.dir)];
const problems = targets.flatMap(validate);
if (problems.length > 0) fail(`plugin validation failed:\n  ${problems.join("\n  ")}`);
console.log(`✔ validated ${targets.length} target(s) with --strict`);
