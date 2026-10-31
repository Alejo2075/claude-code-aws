import type { CostEstimate } from "@claude-code-aws/report-contract";

const usd = (value: number): string => `$${value.toFixed(2)}`;

export function renderCostEstimate(estimate: CostEstimate): string {
  const lines = [
    `ESTIMATED monthly cost: ${usd(estimate.totalMonthly)} (${estimate.currency}, ${estimate.region}, list prices published up to ${estimate.rateDate})`,
    "This is an estimate from your inputs. It is not a billed amount and not a forecast of your invoice.",
    "",
    ...estimate.lines.map(
      (line) =>
        `  ${line.service.padEnd(16)} ${usd(line.monthly).padStart(10)}   ${line.description} [${line.quantity.toLocaleString("en-US")} ${line.unit}]`,
    ),
    "",
    "Assumptions:",
    ...estimate.assumptions.map((a) => `  - ${a}`),
    "",
    "Not included:",
    ...estimate.exclusions.map((e) => `  - ${e}`),
    "",
    "Limitations:",
    ...estimate.limitations.map((l) => `  - ${l}`),
  ];
  return lines.join("\n");
}
