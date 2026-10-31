import { parse, stringify } from "yaml";

export const OPERATORS = ["<", "<=", ">", ">=", "=="] as const;
export type Operator = (typeof OPERATORS)[number];

export interface Manifest {
  schemaVersion: 1;
  name: string;
  owner: string;
  status: "draft" | "running" | "done" | "abandoned";
  question: string;
  hypothesis: string;
  successMetric: { name: string; operator: Operator; target: number; unit: string };
  pattern: string;
  variants: Array<{ id: string; description: string; tradeoffs: string }>;
  budget: { maxUsd: number; maxHours: number };
  usage: { requestsPerRun: number; runs: number };
  permissions: string[];
  assumptions: string[];
  decisionDeadline: string;
  blastRadius: string;
  sandbox: { accountId: string; region: string } | null;
  cleanup: { tagKey: string; tagValue: string; resources: Array<{ type: string; name: string }> };
  decision: string;
}

export interface Problem {
  severity: "error" | "warning";
  message: string;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
export const MAX_YAML = 100_000;

export function parseManifest(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (text.length > MAX_YAML) return { ok: false, error: "the manifest is too large" };
  try {
    return { ok: true, value: parse(text, { maxAliasCount: 20, strict: true }) as unknown };
  } catch {
    return { ok: false, error: "the manifest is not valid YAML" };
  }
}

export const toYaml = (value: unknown): string => stringify(value, { lineWidth: 100 });

export const SLUG = /^[a-z0-9][a-z0-9-]{0,48}$/;

/** Checks that a prototype is bounded enough to run: a question, a metric with a number, a budget, a cleanup. */
export function checkManifest(
  value: unknown,
  now: Date,
): { manifest: Manifest | null; problems: Problem[] } {
  const problems: Problem[] = [];
  const err = (message: string): void => void problems.push({ severity: "error", message });
  const warn = (message: string): void => void problems.push({ severity: "warning", message });
  if (!isRecord(value) || value["schemaVersion"] !== 1) {
    err("The manifest must be a mapping with schemaVersion: 1.");
    return { manifest: null, problems };
  }
  const str = (key: string): string => (typeof value[key] === "string" ? value[key] : "");
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  const name = str("name");
  if (!SLUG.test(name))
    err("name must be lowercase letters, digits, and dashes (up to 49 characters).");
  if (str("question").trim().length < 10)
    err("question: state the engineering question this prototype answers.");
  if (str("hypothesis").trim().length < 10)
    err("hypothesis: state what you expect to find, before running anything.");
  const metric = isRecord(value["successMetric"]) ? value["successMetric"] : null;
  if (
    metric === null ||
    typeof metric["name"] !== "string" ||
    typeof metric["target"] !== "number" ||
    !OPERATORS.includes(metric["operator"] as Operator)
  )
    err("successMetric needs name, operator (<, <=, >, >=, ==), and a numeric target.");
  const budget = isRecord(value["budget"]) ? value["budget"] : null;
  if (
    budget === null ||
    typeof budget["maxUsd"] !== "number" ||
    budget["maxUsd"] < 0 ||
    typeof budget["maxHours"] !== "number"
  )
    err("budget needs numeric maxUsd and maxHours (use 0 for a local-only prototype).");
  const usage = isRecord(value["usage"]) ? value["usage"] : null;
  if (
    usage === null ||
    typeof usage["requestsPerRun"] !== "number" ||
    typeof usage["runs"] !== "number"
  )
    err("usage needs numeric requestsPerRun and runs, so the cost can be bounded before running.");
  const cleanup = isRecord(value["cleanup"]) ? value["cleanup"] : null;
  if (
    cleanup === null ||
    typeof cleanup["tagKey"] !== "string" ||
    typeof cleanup["tagValue"] !== "string"
  )
    err(
      "cleanup needs tagKey and tagValue: every resource a prototype creates must carry an ownership tag.",
    );
  const permissions = list(value["permissions"]);
  for (const p of permissions)
    if (/(^|[\s,:])\*($|[\s,])/.test(p) || /\bAdministratorAccess\b/.test(p))
      err(`permissions must be specific; "${p.slice(0, 60)}" is a wildcard.`);
  if (permissions.length === 0)
    warn("permissions is empty: list what the prototype needs, even if it is nothing.");
  if (str("blastRadius").trim() === "")
    err("blastRadius: say what this can affect if it goes wrong.");
  if (
    /\bprod(uction)?\b/i.test(str("blastRadius")) &&
    !/\b(no|not|never|without)\b/i.test(str("blastRadius"))
  )
    err(
      "blastRadius mentions production. A prototype runs in a sandbox, never against production.",
    );
  const sandbox = isRecord(value["sandbox"]) ? value["sandbox"] : null;
  if (
    sandbox !== null &&
    !(
      typeof sandbox["accountId"] === "string" &&
      /^\d{12}$/.test(sandbox["accountId"]) &&
      typeof sandbox["region"] === "string"
    )
  )
    err("sandbox, when present, needs a 12-digit accountId and a region.");
  const deadline = Date.parse(str("decisionDeadline"));
  if (!Number.isFinite(deadline)) err("decisionDeadline must be a date such as 2026-11-30.");
  else if (deadline < now.getTime())
    warn("decisionDeadline is in the past: decide, extend it, or abandon the prototype.");
  const variants = Array.isArray(value["variants"]) ? value["variants"].filter(isRecord) : [];
  const ids = variants.map((v) => (typeof v["id"] === "string" ? v["id"] : ""));
  if (new Set(ids).size !== ids.length || ids.some((i) => i === ""))
    err("variants need unique, non-empty ids.");
  if (problems.some((p) => p.severity === "error")) return { manifest: null, problems };
  return {
    manifest: {
      schemaVersion: 1,
      name,
      owner: str("owner"),
      status: (["draft", "running", "done", "abandoned"].includes(str("status"))
        ? str("status")
        : "draft") as Manifest["status"],
      question: str("question"),
      hypothesis: str("hypothesis"),
      successMetric: metric as unknown as Manifest["successMetric"] & object,
      pattern: str("pattern"),
      variants: variants.map((v) => ({
        id: String(v["id"]),
        description: typeof v["description"] === "string" ? v["description"] : "",
        tradeoffs: typeof v["tradeoffs"] === "string" ? v["tradeoffs"] : "",
      })),
      budget: budget as unknown as Manifest["budget"],
      usage: usage as unknown as Manifest["usage"],
      permissions,
      assumptions: list(value["assumptions"]),
      decisionDeadline: str("decisionDeadline"),
      blastRadius: str("blastRadius"),
      sandbox:
        sandbox === null
          ? null
          : { accountId: String(sandbox["accountId"]), region: String(sandbox["region"]) },
      cleanup: cleanup as unknown as Manifest["cleanup"],
      decision: str("decision"),
    },
    problems,
  };
}
