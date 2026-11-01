// The only AWS access of the billed-cost commands: STS GetCallerIdentity, Cost Explorer
// GetCostAndUsage (billed per request), and Budgets DescribeBudgets (free). Nothing can change an
// account. Every Cost Explorer request is counted so the command can stop at the limit it announced.
import { BudgetsClient, DescribeBudgetsCommand } from "@aws-sdk/client-budgets";
import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { clientDefaults, type Identity, verifyWithSts } from "@claude-code-aws/aws-client";

export interface CostGroup {
  key: string;
  amount: number;
}
export interface CostPeriod {
  start: string;
  end: string;
  estimated: boolean;
  groups: CostGroup[];
}
export interface BudgetInfo {
  name: string;
  type: string;
  limit: number | null;
  unit: string;
  timeUnit: string;
  actual: number | null;
  forecast: number | null;
}

export interface ActualApi {
  identity(): Promise<Identity>;
  costs(input: {
    start: string;
    end: string;
    granularity: "DAILY" | "MONTHLY";
    groupBy: "SERVICE" | "REGION" | "LINKED_ACCOUNT";
    maxRequests: number;
  }): Promise<{ periods: CostPeriod[]; requests: number; truncated: boolean; unit: string }>;
  budgets(accountId: string, limit: number): Promise<BudgetInfo[]>;
  close(): void;
}

const DEADLINE_MS = 20_000;
const num = (v: string | undefined): number | null =>
  v === undefined || v === "" ? null : Number(v);

export function createActualApi(): ActualApi {
  // Cost Explorer and Budgets are global services served from us-east-1.
  const region = "us-east-1";
  const defaults = clientDefaults(region);
  const ce = new CostExplorerClient(defaults);
  const budgets = new BudgetsClient(defaults);
  const o = (): { abortSignal: AbortSignal } => ({ abortSignal: AbortSignal.timeout(DEADLINE_MS) });
  return {
    identity: () => verifyWithSts({ region, timeoutMs: DEADLINE_MS }),
    close() {
      ce.destroy();
      budgets.destroy();
    },
    async costs(input) {
      const periods: CostPeriod[] = [];
      let token: string | undefined;
      let requests = 0;
      let unit = "USD";
      do {
        const r = await ce.send(
          new GetCostAndUsageCommand({
            TimePeriod: { Start: input.start, End: input.end },
            Granularity: input.granularity,
            Metrics: ["UnblendedCost"],
            GroupBy: [{ Type: "DIMENSION", Key: input.groupBy }],
            NextPageToken: token,
          }),
          o(),
        );
        requests += 1;
        for (const row of r.ResultsByTime ?? []) {
          periods.push({
            start: row.TimePeriod?.Start ?? "",
            end: row.TimePeriod?.End ?? "",
            estimated: row.Estimated === true,
            groups: (row.Groups ?? []).map((g) => {
              const m = g.Metrics?.["UnblendedCost"];
              if (m?.Unit !== undefined) unit = m.Unit;
              return { key: g.Keys?.[0] ?? "", amount: num(m?.Amount) ?? 0 };
            }),
          });
        }
        token = r.NextPageToken;
      } while (token !== undefined && requests < input.maxRequests);
      return { periods, requests, truncated: token !== undefined, unit };
    },
    async budgets(accountId, limit) {
      const out: BudgetInfo[] = [];
      let token: string | undefined;
      do {
        const r = await budgets.send(
          new DescribeBudgetsCommand({ AccountId: accountId, MaxResults: 100, NextToken: token }),
          o(),
        );
        for (const b of r.Budgets ?? [])
          out.push({
            name: b.BudgetName ?? "",
            type: b.BudgetType ?? "",
            limit: num(b.BudgetLimit?.Amount),
            unit: b.BudgetLimit?.Unit ?? "",
            timeUnit: b.TimeUnit ?? "",
            actual: num(b.CalculatedSpend?.ActualSpend?.Amount),
            forecast: num(b.CalculatedSpend?.ForecastedSpend?.Amount),
          });
        token = r.NextToken;
      } while (token !== undefined && out.length < limit);
      return out.slice(0, limit);
    },
  };
}
