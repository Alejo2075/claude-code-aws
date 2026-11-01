import { classifyError } from "@claude-code-aws/aws-client";
import type { ExecutionContext } from "@claude-code-aws/report-contract";
import {
  compareStacks,
  parseTemplate,
  summarizeChanges,
  type Template,
} from "@claude-code-aws/template-analysis";
import {
  type LoadedStack,
  loadStacks,
  type Runner,
  synth,
} from "@claude-code-aws/template-analysis/node";

import type { DeployApi } from "./aws.js";
import {
  broadeningChanges,
  type Broadening,
  type DeployPlan,
  type Destructive,
  newPlanId,
  PLAN_TTL_MS,
  templateHash,
} from "./plan.js";

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

export interface PreflightInput {
  root: string;
  env: Record<string, string | undefined>;
  api: DeployApi;
  region: string;
  workspaceId: string;
  /** Limit the review to these stacks. Default: every stack of the app. */
  stacks?: readonly string[];
  /** The environment aws-context recorded for an account; adopted only if it is this account. */
  known: { accountId: string; environment: "production" | "non-production" | "unknown" } | null;
  run?: Runner;
  now?: Date;
}

export interface PreflightOutcome {
  checks: Check[];
  /** A check failed: no plan can be made. */
  blocked: boolean;
  plan: DeployPlan | null;
  context: ExecutionContext | null;
  /** Stacks that do not exist yet in the account. */
  newStacks: string[];
  stacks: LoadedStack[];
}

const NOT_CHECKED =
  "Not checked here: tests (run /aws-testing:run) and the security audit (run /aws-security:audit). A deployment plan does not replace them.";

function failure(name: string, error: unknown): Check {
  const code = classifyError(error).code;
  const text: Record<string, string> = {
    NO_CREDENTIALS: "No AWS credentials were found.",
    SSO_EXPIRED: "The SSO session expired. Sign in yourself, then retry.",
    CREDENTIALS_EXPIRED: "The credentials expired. Sign in yourself, then retry.",
    CREDENTIALS_INVALID: "AWS rejected the credentials.",
    ACCESS_DENIED: "The identity is not allowed to make this read call.",
    OFFLINE: "AWS could not be reached.",
    TIMEOUT: "AWS did not answer in time.",
  };
  return {
    name,
    status: "fail",
    detail: text[code] ?? "The call failed for an unrecognized reason.",
  };
}

/** Reviews the app against the account and, if nothing blocks, produces a plan. Never changes anything. */
export async function preflight(input: PreflightInput): Promise<PreflightOutcome> {
  const now = input.now ?? new Date();
  const checks: Check[] = [];
  const empty = (): PreflightOutcome => ({
    checks,
    blocked: true,
    plan: null,
    context: null,
    newStacks: [],
    stacks: [],
  });

  let accountId: string;
  try {
    const identity = await input.api.identity();
    accountId = identity.accountId;
    checks.push({
      name: "Identity",
      status: "pass",
      detail: `STS confirmed account ${accountId}, ${identity.arn}, in ${input.region}.`,
    });
  } catch (error) {
    checks.push(failure("Identity", error));
    return empty();
  }
  const environment = input.known?.accountId === accountId ? input.known.environment : "unknown";
  checks.push({
    name: "Environment",
    status: environment === "non-production" ? "pass" : "warn",
    detail:
      environment === "unknown"
        ? "The account is not classified in your aws-context configuration, so it is treated as unclassified and needs the same confirmation as production."
        : `${environment}, from your aws-context configuration.`,
  });
  const context: ExecutionContext = {
    accountId,
    region: input.region,
    profile: null,
    identityVerified: true,
    environment,
  };

  try {
    const toolkit = await input.api.describeStack("CDKToolkit");
    checks.push(
      toolkit !== null && /COMPLETE$/.test(toolkit.status) && !/ROLLBACK/.test(toolkit.status)
        ? {
            name: "Bootstrap",
            status: "pass",
            detail: `The CDKToolkit stack is ${toolkit.status}.`,
          }
        : {
            name: "Bootstrap",
            status: "warn",
            detail:
              toolkit === null
                ? "No CDKToolkit stack in this account and region: `cdk deploy` needs the environment to be bootstrapped. This plugin does not bootstrap."
                : `The CDKToolkit stack is ${toolkit.status}.`,
          },
    );
  } catch (error) {
    checks.push({ ...failure("Bootstrap", error), status: "warn" });
  }

  const built = await synth({
    root: input.root,
    env: input.env,
    ...(input.stacks === undefined ? {} : { stacks: input.stacks }),
    ...(input.run === undefined ? {} : { run: input.run }),
  });
  if (!built.ok || built.outDir === null) {
    checks.push({
      name: "Synth",
      status: "fail",
      detail:
        `${built.diagnostic?.code ?? "FAILED"}: ${built.diagnostic?.message ?? ""} ${built.diagnostic?.hint ?? ""}`.trim(),
    });
    return { ...empty(), context };
  }
  const loaded = loadStacks(input.root, "cdk.out");
  const chosen = loaded.stacks.filter(
    (stack) =>
      input.stacks === undefined || input.stacks.length === 0 || input.stacks.includes(stack.name),
  );
  if (chosen.length === 0) {
    checks.push({
      name: "Synth",
      status: "fail",
      detail:
        `Synthesis worked but no matching stack was found. ${loaded.problems.join(" ")}`.trim(),
    });
    return { ...empty(), context };
  }
  checks.push({
    name: "Synth",
    status: "pass",
    detail: `${chosen.length} stack(s) synthesized without AWS credentials: ${chosen.map((s) => s.name).join(", ")}.`,
  });

  const destructive: Destructive[] = [];
  const broadening: Broadening[] = [];
  const newStacks: string[] = [];
  const counts = { create: 0, update: 0, replace: 0, possibleReplace: 0, delete: 0, unknown: 0 };
  for (const stack of chosen) {
    let before: Template | null = null;
    try {
      const body = await input.api.getTemplate(stack.name);
      if (body === null) newStacks.push(stack.name);
      else {
        const parsed = parseTemplate(body);
        if (!parsed.ok) {
          checks.push({
            name: `Diff ${stack.name}`,
            status: "fail",
            detail: `The deployed template could not be read: ${parsed.error}.`,
          });
          return { ...empty(), context, stacks: chosen };
        }
        before = parsed.template;
      }
    } catch (error) {
      checks.push(failure(`Diff ${stack.name}`, error));
      return { ...empty(), context, stacks: chosen };
    }
    const { diff } = compareStacks({
      baseline:
        before === null
          ? [{ name: stack.name, file: "none", template: { ...stack.template, resources: {} } }]
          : [{ name: stack.name, file: "deployed", template: before }],
      candidate: [stack],
      baselineLabel: before === null ? "(new stack)" : `deployed ${stack.name}`,
      candidateLabel: "cdk.out",
      context,
      plugin: "aws-deploy",
      now,
    });
    for (const key of Object.keys(counts) as Array<keyof typeof counts>)
      counts[key] += summarizeChanges(diff.changes)[key];
    for (const change of diff.changes) {
      const risky =
        change.stateful &&
        (change.action === "replace" ||
          change.action === "possible-replace" ||
          (change.action === "delete" && change.retained !== true));
      if (risky)
        destructive.push({
          logicalId: `${stack.name}/${change.logicalId}`,
          resourceType: change.resourceType,
          action: change.action,
          why: change.note ?? "stateful resource",
        });
    }
    for (const item of broadeningChanges(before, stack.template))
      broadening.push({
        ...item,
        id: `${stack.name}/${item.id}`,
        owner: `${stack.name}/${item.owner}`,
      });
  }
  const sumCounts = Object.values(counts).reduce((a, b) => a + b, 0);
  checks.push({
    name: "Diff",
    status: "pass",
    detail: `${sumCounts === 0 ? "No resource differs" : `${counts.create} create, ${counts.update} update, ${counts.replace} replace, ${counts.possibleReplace} possibly replace, ${counts.delete} delete, ${counts.unknown} unknown`}${newStacks.length > 0 ? `; new stack(s): ${newStacks.join(", ")}` : ""}. Template comparison, not a change set.`,
  });
  checks.push(
    destructive.length === 0
      ? {
          name: "Destructive changes",
          status: "pass",
          detail: "No stateful resource would be replaced or deleted without a retain policy.",
        }
      : {
          name: "Destructive changes",
          status: "warn",
          detail: `${destructive.length} stateful change(s) can lose data: ${destructive.map((d) => `${d.action} ${d.logicalId}`).join("; ")}. Each needs its own acknowledgment.`,
        },
  );
  checks.push(
    broadening.length === 0
      ? {
          name: "Permission changes",
          status: "pass",
          detail: "No new Allow statement compared with the deployed template.",
        }
      : {
          name: "Permission changes",
          status: "warn",
          detail: `${broadening.length} new or broadened statement(s): ${broadening
            .slice(0, 5)
            .map((b) => `${b.owner} ${b.summary}`)
            .join("; ")}${broadening.length > 5 ? "; ..." : ""}.`,
        },
  );
  checks.push({ name: "Other checks", status: "skipped", detail: NOT_CHECKED });

  const plan: DeployPlan = {
    schemaVersion: "1",
    id: newPlanId(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PLAN_TTL_MS).toISOString(),
    workspaceId: input.workspaceId,
    accountId,
    region: input.region,
    environment,
    stacks: chosen.map((stack) => ({
      name: stack.name,
      templateSha256: templateHash(stack.template),
    })),
    counts,
    destructive,
    broadening,
  };
  return { checks, blocked: false, plan, context, newStacks, stacks: chosen };
}
