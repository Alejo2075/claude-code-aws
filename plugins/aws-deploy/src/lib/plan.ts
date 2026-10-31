// A deployment is bound to a plan: the account, region, environment, stacks, and the hash of every
// synthesized template that was reviewed. `deploy` takes only a plan id and refuses when any of those
// changed, when the plan is old, or when an acknowledgment is missing. The plan holds no secrets.
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readTextBounded } from "@claude-code-aws/context-contract/node";
import {
  type PolicyStatement,
  iamStatements,
  type Template,
} from "@claude-code-aws/template-analysis";

export const PLAN_TTL_MS = 60 * 60 * 1000;
const MAX_PLAN_BYTES = 512 * 1024;
const PLAN_ID = /^[0-9a-f]{16}$/;

export interface PlannedStack {
  name: string;
  templateSha256: string;
}

export interface Destructive {
  logicalId: string;
  resourceType: string;
  action: string;
  why: string;
}

export interface Broadening {
  /** Stable id to acknowledge: `<owner>#<index>`. */
  id: string;
  owner: string;
  summary: string;
}

export interface DeployPlan {
  schemaVersion: "1";
  id: string;
  createdAt: string;
  expiresAt: string;
  workspaceId: string;
  accountId: string;
  region: string;
  environment: "production" | "non-production" | "unknown";
  stacks: PlannedStack[];
  counts: {
    create: number;
    update: number;
    replace: number;
    possibleReplace: number;
    delete: number;
    unknown: number;
  };
  destructive: Destructive[];
  broadening: Broadening[];
}

export function templateHash(template: Template): string {
  return createHash("sha256").update(canonical(template.raw)).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

export function newPlanId(): string {
  return randomBytes(8).toString("hex");
}

const key = (statement: PolicyStatement): string =>
  JSON.stringify([
    statement.kind,
    statement.effect,
    [...statement.actions].sort(),
    [...statement.resources].sort(),
    [...statement.notActions].sort(),
    [...statement.principals].sort(),
    statement.condition,
  ]);

/**
 * Permission-broadening changes: Allow statements (and trust or resource-policy grants) that the
 * deployed template does not have. A statement whose breadth already existed is not new; an added
 * action to an old statement shows up as a new statement because the key includes the actions.
 */
const RESOURCELESS = new Set([
  "xray:PutTraceSegments",
  "xray:PutTelemetryRecords",
  "ecr:GetAuthorizationToken",
  "sts:GetCallerIdentity",
  "logs:CreateLogGroup",
  "cloudwatch:PutMetricData",
]);

/** A statement worth a person's attention even in a stack that is brand new. */
function notable(statement: PolicyStatement): boolean {
  const wildcardAction =
    statement.actions.some((action) => action === "*" || action.endsWith(":*")) ||
    statement.notActions.length > 0;
  const wildcardResource =
    statement.resources.includes("*") &&
    !statement.actions.every((action) => RESOURCELESS.has(action));
  const openPrincipal = statement.principals.some(
    (principal) => principal === "*" || principal === "AWS:*" || /^AWS:/.test(principal),
  );
  return wildcardAction || wildcardResource || openPrincipal;
}

/**
 * Permission-broadening changes. For an existing stack: every Allow statement the deployed template
 * does not have. For a stack that does not exist yet there is nothing to compare with, so only the
 * statements that are broad on their face (wildcards, other accounts) are listed, to keep the list
 * about decisions rather than about every role CDK creates.
 */
export function broadeningChanges(before: Template | null, after: Template): Broadening[] {
  const known = new Set((before === null ? [] : iamStatements(before)).map(key));
  const out: Broadening[] = [];
  const counters = new Map<string, number>();
  for (const statement of iamStatements(after)) {
    const index = counters.get(statement.owner) ?? 0;
    counters.set(statement.owner, index + 1);
    if (statement.effect !== "Allow" || known.has(key(statement))) continue;
    if (before === null && !notable(statement)) continue;
    const who = statement.principals.length > 0 ? ` to ${statement.principals.join(", ")}` : "";
    const what =
      statement.actions.length > 0
        ? statement.actions.join(", ")
        : `everything except ${statement.notActions.join(", ")}`;
    out.push({
      id: `${statement.owner}#${index}`,
      owner: statement.owner,
      summary: `${statement.kind === "trust" ? "trusts" : "allows"} ${what}${who}${statement.hasCondition ? " (with a condition)" : ""}`,
    });
  }
  return out;
}

export function planDir(configDir: string, workspace: string): string {
  return join(configDir, "aws-deploy", "v1", workspace, "plans");
}

export function savePlan(configDir: string, plan: DeployPlan): string {
  const dir = planDir(configDir, plan.workspaceId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, `${plan.id}.json`);
  writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return file;
}

export type LoadedPlan = { ok: true; plan: DeployPlan } | { ok: false; reason: string };

export function loadPlan(configDir: string, workspace: string, id: string, now: Date): LoadedPlan {
  if (!PLAN_ID.test(id)) return { ok: false, reason: "The plan id is not valid." };
  const read = readTextBounded(join(planDir(configDir, workspace), `${id}.json`), MAX_PLAN_BYTES);
  if (read.kind !== "ok")
    return { ok: false, reason: "There is no such plan for this project. Run `plan` first." };
  let plan: DeployPlan;
  try {
    plan = JSON.parse(read.text) as DeployPlan;
  } catch {
    return { ok: false, reason: "The plan file is damaged. Run `plan` again." };
  }
  if (
    (plan.schemaVersion as string) !== "1" ||
    plan.id !== id ||
    plan.workspaceId !== workspace ||
    !Array.isArray(plan.stacks)
  ) {
    return { ok: false, reason: "The plan file does not match this project. Run `plan` again." };
  }
  if (Date.parse(plan.expiresAt) <= now.getTime())
    return {
      ok: false,
      reason:
        "The plan has expired. Plans last one hour so the review stays fresh: run `plan` again.",
    };
  return { ok: true, plan };
}

/** Removes plans that have expired or are damaged. Returns how many were removed. */
export function prunePlans(configDir: string, workspace: string, now: Date): number {
  const dir = planDir(configDir, workspace);
  let removed = 0;
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!/^[0-9a-f]{16}\.json$/.test(name)) continue;
    const read = readTextBounded(join(dir, name), MAX_PLAN_BYTES);
    let expires: string | undefined;
    try {
      expires =
        read.kind === "ok"
          ? (JSON.parse(read.text) as { expiresAt?: string }).expiresAt
          : undefined;
    } catch {
      expires = undefined;
    }
    if (expires === undefined || Date.parse(expires) <= now.getTime()) {
      rmSync(join(dir, name), { force: true });
      removed += 1;
    }
  }
  return removed;
}

export interface Confirmation {
  required: string;
  ok: boolean;
}

/** The exact string that approves a production deployment: `account:region:stack,stack`. */
export function confirmationFor(plan: Pick<DeployPlan, "accountId" | "region" | "stacks">): string {
  return `${plan.accountId}:${plan.region}:${plan.stacks
    .map((stack) => stack.name)
    .sort()
    .join(",")}`;
}

export interface GateInput {
  plan: DeployPlan;
  identity: { accountId: string };
  region: string;
  currentHashes: Map<string, string>;
  confirm: string | null;
  acceptDestructive: readonly string[];
  acceptSecurityChanges: boolean;
}

/** Everything that must hold before `cdk deploy` may start. An empty list means it may. */
export function gateProblems(input: GateInput): string[] {
  const { plan } = input;
  const problems: string[] = [];
  if (input.identity.accountId !== plan.accountId)
    problems.push(`The active account is not the planned one (plan: ${plan.accountId}).`);
  if (input.region !== plan.region)
    problems.push(`The region is not the planned one (plan: ${plan.region}).`);
  for (const stack of plan.stacks) {
    const now = input.currentHashes.get(stack.name);
    if (now === undefined) problems.push(`Stack ${stack.name} is no longer produced by the app.`);
    else if (now !== stack.templateSha256)
      problems.push(
        `The template of ${stack.name} changed since it was reviewed. Run \`plan\` again.`,
      );
  }
  for (const name of input.currentHashes.keys()) {
    if (!plan.stacks.some((stack) => stack.name === name))
      problems.push(`Stack ${name} was not in the plan.`);
  }
  if (plan.environment !== "non-production" && input.confirm !== confirmationFor(plan)) {
    problems.push(
      `The target is ${plan.environment === "production" ? "production" : "an unclassified environment"}: confirm it by passing --confirm ${confirmationFor(plan)}`,
    );
  }
  const accepted = new Set(input.acceptDestructive);
  for (const item of plan.destructive) {
    if (!accepted.has(item.logicalId))
      problems.push(
        `Destructive change not acknowledged: ${item.action} ${item.logicalId} (${item.resourceType}). Pass --accept-destructive ${item.logicalId}.`,
      );
  }
  if (plan.broadening.length > 0 && !input.acceptSecurityChanges) {
    problems.push(
      `${plan.broadening.length} change(s) broaden permissions (${plan.broadening
        .slice(0, 3)
        .map((b) => b.owner)
        .join(
          ", ",
        )}${plan.broadening.length > 3 ? ", ..." : ""}). Review them in the plan and pass --accept-security-changes.`,
    );
  }
  return problems;
}
