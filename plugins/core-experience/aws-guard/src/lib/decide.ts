// Turns classified invocations into a decision. The guard can only add friction: its outputs are
// "no decision" (the normal permission flow applies), `ask`, or `deny`. It never allows.
import { maskAccount, type Interpretation } from "@claude-code-aws/context-contract";

import { optionValue, parseArgs } from "./args.js";
import type { GuardConfig, Rule } from "./config.js";
import { globMatch } from "./glob.js";
import { shorten } from "./redact.js";
import { classifyTool } from "./rules/tools.js";
import { CHANGING, type Classification, type Invocation } from "./types.js";

export type Decision = "none" | "ask" | "deny";

export type ReasonCode =
  | "GUARD_DENIED_BY_RULE"
  | "GUARD_ASK_BY_RULE"
  | "GUARD_DESTRUCTIVE"
  | "GUARD_PRODUCTION_CHANGE"
  | "GUARD_TARGET_UNVERIFIED"
  | "GUARD_UNANALYZABLE"
  | "GUARD_UNATTENDED";

export interface Target {
  /** The account is known and verified for this call. */
  known: boolean;
  environment: "production" | "non-production" | "unknown";
  /** Masked account id, when known. */
  account: string | null;
  /** Why the target is not known. */
  unknownBecause: string | null;
  /** The call goes to a local emulator, not to AWS. */
  emulator: boolean;
}

export interface Finding {
  tool: string;
  summary: string;
  classification: Classification;
  target: Target;
  decision: Decision;
  code: ReasonCode | null;
  reason: string | null;
}

export interface DecideContext {
  identity: Interpretation;
  /** `AWS_PROFILE` of the hook process, which is Claude Code's own environment. */
  processProfile: string | null;
  config: GuardConfig;
}

const CREDENTIAL_ENV = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE",
];

const LOCAL_HOST =
  /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|host\.docker\.internal)$|(^|\.)(localhost|localstack\.cloud)$/i;

function isLocalEndpoint(url: string): boolean {
  const match = url.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?(\[[^\]]+\]|[^/:]+)/i);
  return match !== null && LOCAL_HOST.test(match[1] ?? "");
}

function nonEmpty(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value.trim();
}

/** Which account an invocation would act on, judged against the verified context. */
export function resolveTarget(invocation: Invocation, context: DecideContext): Target {
  const parsed = parseArgs(invocation.args);
  const endpoint =
    optionValue(parsed, "endpoint-url") ??
    nonEmpty(invocation.env["AWS_ENDPOINT_URL"]) ??
    Object.entries(invocation.env).find(([name]) => name.startsWith("AWS_ENDPOINT_URL_"))?.[1] ??
    null;
  const none: Target = {
    known: false,
    environment: "unknown",
    account: null,
    unknownBecause: null,
    emulator: false,
  };
  if (endpoint !== null && isLocalEndpoint(endpoint)) return { ...none, emulator: true };
  if (endpoint !== null) return { ...none, unknownBecause: "the command sets its own endpoint" };

  const credentials = CREDENTIAL_ENV.find((name) => nonEmpty(invocation.env[name]) !== null);
  if (credentials !== undefined) {
    return {
      ...none,
      unknownBecause: "the command sets its own AWS credentials or credential files",
    };
  }
  const { identity } = context;
  const snapshot = identity.snapshot;
  if (identity.state !== "verified" || snapshot === null || snapshot.accountId === null) {
    return { ...none, unknownBecause: `the AWS identity is not verified (${identity.state})` };
  }
  const flagProfile = optionValue(parsed, "profile");
  const chosen =
    flagProfile ??
    nonEmpty(invocation.env["AWS_PROFILE"]) ??
    invocation.vaultProfile ??
    context.processProfile;
  if (chosen !== null && /[$`]/.test(chosen)) {
    return { ...none, unknownBecause: "the command picks its profile with an expansion" };
  }
  if (chosen !== snapshot.profile) {
    return {
      ...none,
      unknownBecause: `the command uses ${chosen === null ? "the default profile" : `profile "${shorten(chosen, 40)}"`}, not the verified ${snapshot.profile === null ? "default profile" : `profile "${shorten(snapshot.profile, 40)}"`}`,
    };
  }
  return {
    known: true,
    environment: snapshot.environment,
    account: maskAccount(snapshot.accountId),
    unknownBecause: null,
    emulator: false,
  };
}

function summarize(invocation: Invocation): string {
  const positionals = parseArgs(invocation.args).positionals.slice(0, 3);
  return shorten([invocation.tool, ...positionals].join(" "), 100);
}

function ruleMatches(
  rule: Rule,
  invocation: Invocation,
  cls: Classification,
  target: Target,
): boolean {
  if (rule.class !== undefined && rule.class !== "any" && rule.class !== cls.class) return false;
  if (rule.tool !== undefined && rule.tool !== invocation.tool) return false;
  if (rule.environment !== undefined) {
    const environment = target.known ? target.environment : "unknown";
    if (rule.environment !== environment) return false;
  }
  if (rule.command !== undefined) {
    const text = `${invocation.tool} ${invocation.args.join(" ")}`.slice(0, 2000);
    if (!globMatch(rule.command, text)) return false;
  }
  return true;
}

const NOTE = "This is a guardrail, not an enforcement boundary: IAM and SCPs are.";

function describeTarget(target: Target): string {
  if (target.known) {
    return `${target.environment === "unknown" ? "environment not classified" : target.environment}, account ${target.account}`;
  }
  return `target not verified: ${target.unknownBecause ?? "unknown"}`;
}

/** Decides one invocation. */
export function decideInvocation(invocation: Invocation, context: DecideContext): Finding {
  const classification = classifyTool(invocation.tool, invocation.args, invocation.dynamic);
  return decideClassified(invocation, classification, context);
}

export function decideClassified(
  invocation: Invocation,
  classification: Classification,
  context: DecideContext,
): Finding {
  const target = resolveTarget(invocation, context);
  const summary = summarize(invocation);
  const base = { tool: invocation.tool, summary, classification, target };
  const quiet: Finding = { ...base, decision: "none", code: null, reason: null };
  if (target.emulator) return quiet;

  const label = `${classification.class} (${summary})`;
  const matched = context.config.rules.filter((rule) =>
    ruleMatches(rule, invocation, classification, target),
  );
  const denyRule = matched.find((rule) => rule.action === "deny");
  if (denyRule !== undefined) {
    return {
      ...base,
      decision: "deny",
      code: "GUARD_DENIED_BY_RULE",
      reason: `aws-guard: ${label} is denied by a rule in your aws-guard configuration. ${NOTE}`,
    };
  }
  if (!CHANGING.has(classification.class)) {
    // Reads and local changes are quiet unless a rule above said otherwise.
    const askRule = matched.find((rule) => rule.action === "ask");
    return askRule === undefined
      ? quiet
      : {
          ...base,
          decision: "ask",
          code: "GUARD_ASK_BY_RULE",
          reason: `aws-guard: ${label} matches an ask rule in your aws-guard configuration. ${NOTE}`,
        };
  }
  if (!target.known && context.config.onUnverified === "deny") {
    return {
      ...base,
      decision: "deny",
      code: "GUARD_TARGET_UNVERIFIED",
      reason: `aws-guard: ${label} is blocked because ${target.unknownBecause ?? "the target is not verified"}. ${NOTE}`,
    };
  }
  if (classification.class === "destructive") {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_DESTRUCTIVE",
      reason: `aws-guard: ${label} can destroy data or infrastructure (${describeTarget(target)}). ${NOTE}`,
    };
  }
  if (!target.known && context.config.onUnverified === "ask") {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_TARGET_UNVERIFIED",
      reason: `aws-guard: ${label} would change AWS, but ${target.unknownBecause ?? "the target is not verified"}. ${NOTE}`,
    };
  }
  if (target.known && target.environment === "production") {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_PRODUCTION_CHANGE",
      reason: `aws-guard: ${label} targets production (account ${target.account}). ${NOTE}`,
    };
  }
  const askRule = matched.find((rule) => rule.action === "ask");
  if (askRule !== undefined) {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_ASK_BY_RULE",
      reason: `aws-guard: ${label} matches an ask rule in your aws-guard configuration (${describeTarget(target)}). ${NOTE}`,
    };
  }
  return quiet;
}
