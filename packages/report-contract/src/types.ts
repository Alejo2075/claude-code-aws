// Wire formats shared by the plugins. Every top-level document carries `schemaVersion`; a reader
// accepts documents it understands and ignores unknown fields, so a newer writer does not break an
// older reader, and rejects a version it does not know.
export const SCHEMA_VERSION = "1" as const;

export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type FindingStatus = "confirmed" | "hypothesis" | "informational";
/** Where a finding came from. `model` findings are hypotheses unless evidence proves them. */
export type FindingSource = "static" | "account" | "model";
export type ReportMode = "local" | "read-only-cloud" | "planned-change" | "executed-change";
/** The vocabulary of `aws-context`. Only the user's own configuration can say `non-production`. */
export type EnvironmentKind = "production" | "non-production" | "unknown";

export interface ExecutionContext {
  accountId: string | null;
  region: string | null;
  profile: string | null;
  /** True only when STS verified the identity recently (the context is current). */
  identityVerified: boolean;
  environment: EnvironmentKind;
}

export interface Evidence {
  /** For example `template`, `file`, `api-call`, `log-query`, `metric`, `doc`. */
  type: string;
  /** Where to look: a path, a logical id, a query id, a URL. */
  reference: string;
  observedAt?: string;
}

export interface Finding {
  id: string;
  /** Stable identifier of the rule or check, for example `SEC-IAM-WILDCARD-ACTION`. */
  ruleId: string;
  plugin: string;
  severity: Severity;
  status: FindingStatus;
  source: FindingSource;
  title: string;
  explanation: string;
  affectedResources?: string[];
  evidence: Evidence[];
  recommendation?: string;
  confidence?: "low" | "medium" | "high";
  /** Stable across runs for the same rule and resource; used for suppressions and comparisons. */
  fingerprint: string;
}

export interface AnalysisReport {
  schemaVersion: typeof SCHEMA_VERSION;
  plugin: string;
  generatedAt: string;
  context: ExecutionContext;
  mode: ReportMode;
  summary: string;
  findings: Finding[];
  limitations: string[];
  /** How many findings were hidden by visible, scoped exclusions. */
  suppressed?: number;
}

export type ChangeAction =
  "create" | "update" | "replace" | "possible-replace" | "delete" | "unknown";

export interface TemplateChange {
  logicalId: string;
  resourceType: string;
  action: ChangeAction;
  /** Top-level properties that differ. */
  properties: string[];
  stateful: boolean;
  /** For deletes: the resource has a Retain policy, so the physical resource survives. */
  retained?: boolean;
  /** For `possible-replace` and `unknown`: why the exact impact cannot be established. */
  note?: string;
}

export interface TemplateDiff {
  schemaVersion: typeof SCHEMA_VERSION;
  plugin: string;
  generatedAt: string;
  context: ExecutionContext;
  /** `template` compares templates only; `change-set` is backed by CloudFormation. */
  method: "template" | "change-set";
  baseline: string;
  candidate: string;
  changes: TemplateChange[];
  summary: Record<
    "create" | "update" | "replace" | "possibleReplace" | "delete" | "unknown",
    number
  >;
  limitations: string[];
}

export interface TestFailure {
  name: string;
  file?: string;
  message: string;
}

export interface TestReport {
  schemaVersion: typeof SCHEMA_VERSION;
  plugin: string;
  generatedAt: string;
  framework: string;
  command: string;
  passed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  failures: TestFailure[];
  coverage?: { lines?: number; branches?: number; functions?: number; statements?: number };
  /** Output was shortened. */
  truncated: boolean;
  limitations: string[];
}

export interface DeploymentEvent {
  at: string;
  stack: string;
  logicalId?: string;
  status: string;
  reason?: string;
}

export type FigureKind = "estimated" | "forecast" | "actual";

export interface CostLine {
  service: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  monthly: number;
}

export interface CostEstimate {
  schemaVersion: typeof SCHEMA_VERSION;
  plugin: string;
  generatedAt: string;
  kind: FigureKind;
  currency: "USD";
  region: string;
  /** Publication date of the price data, or the end of the billing period for `actual`. */
  rateDate: string;
  assumptions: string[];
  exclusions: string[];
  lines: CostLine[];
  totalMonthly: number;
  limitations: string[];
}

export interface TimeSeries {
  schemaVersion: typeof SCHEMA_VERSION;
  namespace: string;
  metric: string;
  statistic: string;
  unit: string;
  periodSeconds: number;
  start: string;
  end: string;
  dimensions: Record<string, string>;
  points: Array<{ t: string; v: number | null }>;
}

export interface ArchitectureComponent {
  id: string;
  kind: string;
  name: string;
  purpose: string;
}

export interface ArchitectureIntegration {
  from: string;
  to: string;
  style: "sync" | "async" | "event";
  note?: string;
}

/** The handoff from `aws-architect` to `aws-infrastructure`. Either plugin works without the other. */
export interface ArchitecturePlan {
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  generatedAt: string;
  requirements: Record<string, string>;
  components: ArchitectureComponent[];
  integrations: ArchitectureIntegration[];
  assumptions: string[];
  risks: string[];
  openQuestions: string[];
}
