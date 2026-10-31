import {
  type AnalysisReport,
  type ArchitecturePlan,
  type CostEstimate,
  type Finding,
  SCHEMA_VERSION,
  type TemplateDiff,
  type TestReport,
  type TimeSeries,
} from "./types.js";

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_STRING = 20_000;
const MAX_ITEMS = 5000;

/** Returns an error message, or null when the value is acceptable. */
type Check = (value: unknown, path: string) => string | null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str: Check = (value, path) =>
  typeof value === "string" && value.length <= MAX_STRING ? null : `${path} must be a string`;
const num: Check = (value, path) =>
  typeof value === "number" && Number.isFinite(value) ? null : `${path} must be a number`;
const bool: Check = (value, path) =>
  typeof value === "boolean" ? null : `${path} must be a boolean`;
const isoDate: Check = (value, path) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? null
    : `${path} must be a date string`;

const nullable =
  (check: Check): Check =>
  (value, path) =>
    value === null ? null : check(value, path);

const oneOf =
  (...allowed: string[]): Check =>
  (value, path) =>
    typeof value === "string" && allowed.includes(value)
      ? null
      : `${path} must be one of ${allowed.join(", ")}`;

const list =
  (item: Check): Check =>
  (value, path) => {
    if (!Array.isArray(value)) return `${path} must be a list`;
    if (value.length > MAX_ITEMS) return `${path} has too many items`;
    for (let i = 0; i < value.length; i += 1) {
      const problem = item(value[i], `${path}[${i}]`);
      if (problem !== null) return problem;
    }
    return null;
  };

const strings = list(str);

/** `required` fields must pass; `optional` fields are checked only when present. Unknown fields are ignored. */
const shape =
  (required: Record<string, Check>, optional: Record<string, Check> = {}): Check =>
  (value, path) => {
    if (!isRecord(value)) return `${path} must be an object`;
    for (const [key, check] of Object.entries(required)) {
      const problem = check(value[key], `${path}.${key}`);
      if (problem !== null) return problem;
    }
    for (const [key, check] of Object.entries(optional)) {
      if (value[key] === undefined) continue;
      const problem = check(value[key], `${path}.${key}`);
      if (problem !== null) return problem;
    }
    return null;
  };

const version: Check = (value, path) =>
  value === SCHEMA_VERSION
    ? null
    : `${path} must be "${SCHEMA_VERSION}" (unsupported schema version)`;

const context = shape({
  accountId: nullable(str),
  region: nullable(str),
  profile: nullable(str),
  identityVerified: bool,
  environment: oneOf("production", "non-production", "unknown"),
});

const finding = shape(
  {
    id: str,
    ruleId: str,
    plugin: str,
    severity: oneOf("info", "low", "medium", "high", "critical"),
    status: oneOf("confirmed", "hypothesis", "informational"),
    source: oneOf("static", "account", "model"),
    title: str,
    explanation: str,
    evidence: list(shape({ type: str, reference: str }, { observedAt: str })),
    fingerprint: str,
  },
  { affectedResources: strings, recommendation: str, confidence: oneOf("low", "medium", "high") },
);

const analysisReport = shape(
  {
    schemaVersion: version,
    plugin: str,
    generatedAt: isoDate,
    context,
    mode: oneOf("local", "read-only-cloud", "planned-change", "executed-change"),
    summary: str,
    findings: list(finding),
    limitations: strings,
  },
  { suppressed: num },
);

const templateDiff = shape({
  schemaVersion: version,
  plugin: str,
  generatedAt: isoDate,
  context,
  method: oneOf("template", "change-set"),
  baseline: str,
  candidate: str,
  changes: list(
    shape(
      {
        logicalId: str,
        resourceType: str,
        action: oneOf("create", "update", "replace", "possible-replace", "delete", "unknown"),
        properties: strings,
        stateful: bool,
      },
      { retained: bool, note: str },
    ),
  ),
  summary: shape({
    create: num,
    update: num,
    replace: num,
    possibleReplace: num,
    delete: num,
    unknown: num,
  }),
  limitations: strings,
});

const testReport = shape(
  {
    schemaVersion: version,
    plugin: str,
    generatedAt: isoDate,
    framework: str,
    command: str,
    passed: num,
    failed: num,
    skipped: num,
    durationMs: num,
    failures: list(shape({ name: str, message: str }, { file: str })),
    truncated: bool,
    limitations: strings,
  },
  { coverage: shape({}, { lines: num, branches: num, functions: num, statements: num }) },
);

const costEstimate = shape({
  schemaVersion: version,
  plugin: str,
  generatedAt: isoDate,
  kind: oneOf("estimated", "forecast", "actual"),
  currency: oneOf("USD"),
  region: str,
  rateDate: str,
  assumptions: strings,
  exclusions: strings,
  lines: list(
    shape({
      service: str,
      description: str,
      quantity: num,
      unit: str,
      unitPrice: num,
      monthly: num,
    }),
  ),
  totalMonthly: num,
  limitations: strings,
});

const timeSeries = shape({
  schemaVersion: version,
  namespace: str,
  metric: str,
  statistic: str,
  unit: str,
  periodSeconds: num,
  start: isoDate,
  end: isoDate,
  dimensions: (value, path) =>
    isRecord(value) && Object.values(value).every((entry) => typeof entry === "string")
      ? null
      : `${path} must map names to strings`,
  points: list(shape({ t: isoDate, v: nullable(num) })),
});

const architecturePlan = shape({
  schemaVersion: version,
  title: str,
  generatedAt: isoDate,
  requirements: (value, path) =>
    isRecord(value) && Object.values(value).every((entry) => typeof entry === "string")
      ? null
      : `${path} must map names to strings`,
  components: list(shape({ id: str, kind: str, name: str, purpose: str })),
  integrations: list(
    shape({ from: str, to: str, style: oneOf("sync", "async", "event") }, { note: str }),
  ),
  assumptions: strings,
  risks: strings,
  openQuestions: strings,
});

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function make<T>(check: Check) {
  const validate = (value: unknown): Parsed<T> => {
    const problem = check(value, "$");
    return problem === null ? { ok: true, value: value as T } : { ok: false, error: problem };
  };
  const parse = (text: string): Parsed<T> => {
    if (text.length > MAX_DOCUMENT_BYTES) return { ok: false, error: "document is too large" };
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, error: "not valid JSON" };
    }
    return validate(value);
  };
  return { validate, parse };
}

export const reportCodec = make<AnalysisReport>(analysisReport);
export const findingCodec = make<Finding>(finding);
export const diffCodec = make<TemplateDiff>(templateDiff);
export const testReportCodec = make<TestReport>(testReport);
export const costCodec = make<CostEstimate>(costEstimate);
export const timeSeriesCodec = make<TimeSeries>(timeSeries);
export const planCodec = make<ArchitecturePlan>(architecturePlan);
