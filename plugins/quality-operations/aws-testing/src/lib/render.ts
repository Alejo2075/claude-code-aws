import type { TestReport } from "@claude-code-aws/report-contract";

export function renderTestReport(report: TestReport): string {
  const verdict = report.failed === 0 ? "All tests passed" : `${report.failed} test(s) failed`;
  const lines = [
    `${verdict}: ${report.passed} passed, ${report.failed} failed, ${report.skipped} skipped in ${Math.round(report.durationMs / 100) / 10}s (${report.framework}: ${report.command})`,
  ];
  for (const failure of report.failures) {
    lines.push(
      "",
      `FAIL ${failure.name}${failure.file === undefined ? "" : `\n     ${failure.file}`}`,
      ...failure.message.split("\n").map((line) => `     ${line}`),
    );
  }
  if (report.truncated) lines.push("", "Output was shortened.");
  lines.push("", "Limitations:", ...report.limitations.map((limitation) => `  - ${limitation}`));
  return lines.join("\n");
}
