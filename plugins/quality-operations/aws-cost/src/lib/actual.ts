// Billed ("actual") cost, kept apart from the estimates in the rest of this plugin. The numbers here
// are what Cost Explorer reports for the account; they lag by up to a day, and recent periods are
// marked estimated by Cost Explorer itself.
import {
  buildReport,
  type ExecutionContext,
  makeFinding,
  renderReport,
} from "@claude-code-aws/report-contract";

import type { ActualApi, BudgetInfo, CostPeriod } from "./actual-api.js";

export const CE_PRICE_PER_REQUEST = 0.01;
export const MAX_REQUESTS = 5;
export const DEFAULT_REQUESTS = 2;

export interface Summary {
  total: number;
  unit: string;
  groups: Array<{ key: string; amount: number; share: number }>;
  periods: number;
  anyEstimated: boolean;
}

export function summarize(periods: readonly CostPeriod[], unit: string): Summary {
  const sums = new Map<string, number>();
  for (const p of periods)
    for (const g of p.groups) sums.set(g.key, (sums.get(g.key) ?? 0) + g.amount);
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  const groups = [...sums.entries()]
    .map(([key, amount]) => ({ key, amount, share: total === 0 ? 0 : amount / total }))
    .sort((a, b) => b.amount - a.amount);
  return {
    total,
    unit,
    groups,
    periods: periods.length,
    anyEstimated: periods.some((p) => p.estimated),
  };
}

/** Where a cost line usually comes from and what to check first. Hypotheses to investigate, not savings. */
const HINTS: Array<[RegExp, string]> = [
  [
    /Lambda/i,
    "Compare memory sizes with measured durations and consider arm64 (/aws-cost:compare lambda-memory, lambda-arch); check retries and error loops first.",
  ],
  [
    /DynamoDB/i,
    "Check on-demand versus provisioned for the real traffic, scans, and GSIs that copy whole items (/aws-database:inspect).",
  ],
  [
    /CloudWatch/i,
    "Log ingestion and retention are the usual drivers: set retention, lower log levels, and check metric and alarm counts (/aws-observability).",
  ],
  [
    /NAT|VPC|Elastic Compute Cloud - Compute|EC2.*Other/i,
    "NAT gateway hours and data processing add up; VPC endpoints for S3 and DynamoDB can remove traffic from them.",
  ],
  [
    /S3|Simple Storage/i,
    "Storage classes, lifecycle rules, incomplete multipart uploads, and request counts (/aws-storage:inspect).",
  ],
  [/CloudFront/i, "Data transfer and request volume; cache hit ratio and compression (/aws-edge)."],
  [
    /API Gateway/i,
    "Request volume and caching; HTTP APIs cost less than REST APIs where features allow (/aws-cost:compare api-kind).",
  ],
  [
    /Key Management|KMS/i,
    "Each customer managed key has a monthly fee plus request charges; remove unused keys only after confirming nothing uses them.",
  ],
  [/Route 53/i, "Hosted zones are billed per month even when unused."],
  [/Tax/i, "Tax is not an optimization target."],
];

export function hintFor(service: string): string | null {
  return HINTS.find(([re]) => re.test(service))?.[1] ?? null;
}

export function budgetFindings(budgets: readonly BudgetInfo[], now: Date) {
  const out = [];
  if (budgets.length === 0)
    out.push(
      makeFinding({
        ruleId: "COST-NO-BUDGET",
        plugin: "aws-cost",
        severity: "medium",
        status: "confirmed",
        source: "account",
        title: "The account has no AWS Budget",
        explanation:
          "Nothing alerts you when spend passes a limit, so a runaway cost shows up on the invoice.",
        subject: "budgets",
        recommendation:
          "Create a monthly cost budget with alerts at, for example, 50% and 100% of the limit (the user creates it; budgets themselves are free for the first ones, check the pricing page).",
        evidence: [
          { type: "api-call", reference: "budgets:DescribeBudgets", observedAt: now.toISOString() },
        ],
      }),
    );
  for (const b of budgets)
    if (b.limit !== null && b.actual !== null && b.limit > 0 && b.actual / b.limit >= 0.8)
      out.push(
        makeFinding({
          ruleId: "COST-BUDGET-NEAR-LIMIT",
          plugin: "aws-cost",
          severity: b.actual >= b.limit ? "high" : "medium",
          status: "confirmed",
          source: "account",
          title: `Budget ${b.name} is at ${Math.round((b.actual / b.limit) * 100)}% of its limit`,
          explanation: `${b.actual.toFixed(2)} of ${b.limit.toFixed(2)} ${b.unit} per ${b.timeUnit.toLowerCase()} has been spent.`,
          subject: b.name,
          evidence: [
            {
              type: "api-call",
              reference: "budgets:DescribeBudgets",
              observedAt: now.toISOString(),
            },
          ],
        }),
      );
  return out;
}

export interface ActualDeps {
  api: () => ActualApi;
  known: () => {
    accountId: string;
    environment: ExecutionContext["environment"];
    profile: string | null;
  } | null;
  now?: Date;
}

const usage = (message: string) => ({
  exitCode: 2,
  stdout: `${message}\n\nUsage:\n  analyze [--since 30d] [--group-by service|region|account] [--granularity monthly|daily] [--max-requests 2] [--approve-cost]\n  optimize [same options as analyze]\n  budgets`,
});

function parseSince(text: string | undefined): number | null {
  const m = /^(\d{1,3})d$/.exec(text ?? "30d");
  const n = m === null ? null : Number(m[1]);
  return n !== null && n >= 1 && n <= 365 ? n : null;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export async function runActual(
  argv: readonly string[],
  deps: ActualDeps,
): Promise<{ exitCode: number; stdout: string }> {
  const [command, ...rest] = argv;
  const opt = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i] ?? "";
    if (!a.startsWith("--")) return usage(`unexpected argument ${a}`);
    const name = a.slice(2);
    if (["approve-cost", "json"].includes(name)) opt.set(name, true);
    else if (["since", "group-by", "granularity", "max-requests"].includes(name)) {
      const v = rest[i + 1];
      if (v === undefined) return usage(`--${name} needs a value`);
      opt.set(name, v);
      i += 1;
    } else return usage(`unknown option --${name}`);
  }
  const json = opt.has("json");
  const now = deps.now ?? new Date();
  const days = parseSince(
    typeof opt.get("since") === "string" ? (opt.get("since") as string) : undefined,
  );
  const groupMap: Record<string, "SERVICE" | "REGION" | "LINKED_ACCOUNT" | undefined> = {
    service: "SERVICE",
    region: "REGION",
    account: "LINKED_ACCOUNT",
  };
  const groupBy = groupMap[String(opt.get("group-by") ?? "service").toLowerCase()];
  const gran =
    String(opt.get("granularity") ?? "monthly").toLowerCase() === "daily" ? "DAILY" : "MONTHLY";
  const max = Number(opt.get("max-requests") ?? DEFAULT_REQUESTS);
  if (days === null) return usage("--since must look like 30d (1 to 365 days)");
  if (groupBy === undefined) return usage("--group-by must be service, region, or account");
  if (!Number.isInteger(max) || max < 1 || max > MAX_REQUESTS)
    return usage(`--max-requests must be 1 to ${MAX_REQUESTS}`);
  if (command !== "analyze" && command !== "optimize" && command !== "budgets")
    return usage("unknown command");

  const api = deps.api();
  try {
    let context: ExecutionContext;
    let accountId: string;
    try {
      const id = await api.identity();
      accountId = id.accountId;
      const known = deps.known();
      context = {
        accountId,
        region: null,
        profile: known?.accountId === accountId ? known.profile : null,
        identityVerified: true,
        environment: known?.accountId === accountId ? known.environment : "unknown",
      };
    } catch {
      return {
        exitCode: 1,
        stdout:
          "The AWS identity could not be verified with STS, so nothing was read. Check your credentials (aws-context status).",
      };
    }
    const print = (value: unknown, text: string) => ({
      exitCode: 0,
      stdout: json ? JSON.stringify(value, null, 2) : text,
    });

    if (command === "budgets") {
      const list = await api.budgets(accountId, 100);
      const report = buildReport({
        plugin: "aws-cost",
        context,
        mode: "read-only-cloud",
        summary: `${list.length} budget(s) in the account (read through Budgets, which is not billed per request).`,
        findings: budgetFindings(list, now),
        limitations: [
          "Budgets are global. Alert recipients and thresholds are not read here.",
          "These are the account's own budgets, not estimates.",
        ],
        now,
      });
      return print(
        { report, budgets: list },
        `${renderReport(report)}\n\n${list.map((b) => `  ${b.name}: ${b.type}, limit ${b.limit ?? "?"} ${b.unit} per ${b.timeUnit.toLowerCase()}, spent ${b.actual ?? "?"}, forecast ${b.forecast ?? "?"}`).join("\n")}`,
      );
    }

    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const start = new Date(end.getTime() - days * 86_400_000);
    const maxCost = max * CE_PRICE_PER_REQUEST;
    if (opt.get("approve-cost") !== true) {
      return print(
        { approved: false, accountId: undefined, maxRequests: max, maxCostUsd: maxCost },
        [
          `NOT RUN. Cost Explorer bills each request (about $${CE_PRICE_PER_REQUEST.toFixed(2)}, and each result page is a request).`,
          `This would read ${iso(start)} to ${iso(end)} grouped by ${groupBy.toLowerCase().replace("_", " ")}, ${gran.toLowerCase()}, with at most ${max} request(s): at most about $${maxCost.toFixed(2)}.`,
          `Account: ${context.accountId?.slice(0, 4) ?? "?"}…${context.accountId?.slice(-4) ?? "?"} (verified with STS). Check this is the account you mean, then run again with --approve-cost.`,
        ].join("\n"),
      );
    }
    const r = await api.costs({
      start: iso(start),
      end: iso(end),
      granularity: gran,
      groupBy,
      maxRequests: max,
    });
    const sum = summarize(r.periods, r.unit);
    const findings = [];
    const top = sum.groups.filter((g) => g.amount > 0).slice(0, 5);
    const lines = [
      `ACTUAL (billed, as Cost Explorer reports it) ${iso(start)} to ${iso(end)}, grouped by ${groupBy.toLowerCase().replace("_", " ")}`,
      `Total ${sum.total.toFixed(2)} ${sum.unit}${sum.anyEstimated ? " (the latest period is marked estimated by Cost Explorer)" : ""}`,
      ...sum.groups
        .filter((g) => g.amount >= 0.005)
        .slice(0, 15)
        .map(
          (g) =>
            `  ${g.key.padEnd(44)} ${g.amount.toFixed(2).padStart(10)} ${(g.share * 100).toFixed(1).padStart(5)}%`,
        ),
    ];
    if (command === "optimize") {
      lines.push(
        "",
        "Where to look first (hypotheses to investigate with the owning plugin, NOT verified savings):",
      );
      for (const g of top) {
        const hint = hintFor(g.key);
        if (hint !== null) lines.push(`  ${g.key} (${(g.share * 100).toFixed(0)}%): ${hint}`);
        if (hint !== null)
          findings.push(
            makeFinding({
              ruleId: "COST-TOP-DRIVER",
              plugin: "aws-cost",
              severity: "info",
              status: "hypothesis",
              source: "account",
              title: `${g.key} is ${(g.share * 100).toFixed(0)}% of the billed cost`,
              explanation: hint,
              subject: g.key,
              evidence: [
                {
                  type: "api-call",
                  reference: "ce:GetCostAndUsage",
                  observedAt: now.toISOString(),
                },
              ],
            }),
          );
      }
    }
    const report = buildReport({
      plugin: "aws-cost",
      context,
      mode: "read-only-cloud",
      summary: `Billed cost ${sum.total.toFixed(2)} ${sum.unit} over ${days} days; top: ${top[0]?.key ?? "none"}.`,
      findings,
      limitations: [
        `Made ${r.requests} Cost Explorer request(s), about $${(r.requests * CE_PRICE_PER_REQUEST).toFixed(2)} (read-only).`,
        ...(r.truncated
          ? [
              `Stopped at the ${max}-request limit: the list is incomplete (raise --max-requests to read more).`,
            ]
          : []),
        "Billed amounts lag by up to about a day and can change until the invoice is final. Credits, refunds, and tax are included or excluded according to Cost Explorer's defaults for this query; check the console before relying on a figure for accounting.",
        "Actual cost, estimates, and savings are different things: nothing here is a forecast or a saving.",
      ],
      now,
    });
    return print(
      { report, summary: sum },
      `${lines.join("\n")}\n\n${report.limitations.map((l) => `- ${l}`).join("\n")}`,
    );
  } finally {
    api.close();
  }
}
