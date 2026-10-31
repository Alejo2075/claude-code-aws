import { redactText } from "@claude-code-aws/safe-output";

type Obj = Record<string, unknown>;
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface HistorySummary {
  events: number;
  entered: string[];
  failures: Array<{ at: string; state: string; type: string; error: string; cause: string }>;
  status: string;
}

/** A summary of `get-execution-history` output (the `events` list). Error and cause text is redacted and shortened. */
export function summarizeHistory(doc: unknown): HistorySummary | null {
  const events =
    isObj(doc) && Array.isArray(doc["events"]) ? doc["events"] : Array.isArray(doc) ? doc : null;
  if (events === null || events.length > 25_000) return null;
  const entered: string[] = [];
  const failures: HistorySummary["failures"] = [];
  let status = "unknown";
  let current = "";
  for (const e of events) {
    if (!isObj(e) || typeof e["type"] !== "string") continue;
    const type = e["type"];
    const at = typeof e["timestamp"] === "string" ? e["timestamp"] : "";
    const entry = isObj(e["stateEnteredEventDetails"]) ? e["stateEnteredEventDetails"] : null;
    if (entry !== null && typeof entry["name"] === "string") {
      current = entry["name"];
      entered.push(current);
    }
    if (type === "ExecutionSucceeded") status = "succeeded";
    if (type === "ExecutionFailed" || type === "ExecutionTimedOut" || type === "ExecutionAborted")
      status = type.replace("Execution", "").toLowerCase();
    if (/Failed$|TimedOut$/.test(type) || type === "ExecutionAborted") {
      const detailsKey = Object.keys(e).find(
        (k) => k.endsWith("EventDetails") && isObj(e[k]) && ("error" in e[k] || "cause" in e[k]),
      );
      const d = detailsKey === undefined ? {} : (e[detailsKey] as Obj);
      failures.push({
        at,
        state: current,
        type,
        error: redactText(txt(d["error"])).text.slice(0, 200),
        cause: redactText(txt(d["cause"])).text.slice(0, 300),
      });
    }
  }
  return { events: events.length, entered, failures, status };
}
