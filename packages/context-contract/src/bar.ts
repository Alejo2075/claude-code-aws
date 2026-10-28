import type { DisplayState, Interpretation } from "./interpret.js";

export interface BarOptions {
  /** Mask the account id as `1234…9012`. Defaults to true. */
  maskAccountId?: boolean;
  /** Include the configured profile when space allows. Defaults to true. */
  showProfile?: boolean;
  /** Maximum width in cells. The result is never longer. Defaults to 200. */
  width?: number;
  /** Use only ASCII (`|` separators, `...` mask) for terminals without Unicode. */
  ascii?: boolean;
}

export type Tone = "ok" | "alert" | "warn" | "danger" | "muted";

interface Segment {
  text: string;
  /** Lower values are dropped first when the line is too wide. */
  priority: number;
}

const STATE_LABEL: Record<DisplayState, string> = {
  "not-configured": "not configured",
  verified: "verified",
  stale: "stale",
  expired: "expired",
  offline: "offline",
  error: "error",
  unverified: "unverified",
};

export function maskAccount(accountId: string, ascii = false): string {
  return `${accountId.slice(0, 4)}${ascii ? "..." : "…"}${accountId.slice(-4)}`;
}

function stateLabel(interpretation: Interpretation): string {
  const code = interpretation.snapshot?.diagnosticCode;
  if (interpretation.state === "expired") {
    if (code === "SSO_EXPIRED") return "expired (SSO session)";
    if (code === "CREDENTIALS_EXPIRED") return "expired (credentials)";
  }
  if (interpretation.state === "stale") return "stale (refresh to verify)";
  return STATE_LABEL[interpretation.state];
}

export function toneOf(interpretation: Interpretation): Tone {
  switch (interpretation.state) {
    case "verified":
      return interpretation.snapshot?.environment === "production" ? "alert" : "ok";
    case "stale":
    case "unverified":
    case "offline":
      return "warn";
    case "expired":
    case "error":
      return "danger";
    case "not-configured":
      return "muted";
  }
}

/**
 * One line, always bounded by `width`. A stale or failed state never shows its account as
 * current: it is prefixed `last known`. Segments are dropped by priority before any hard cut.
 */
export function formatBar(interpretation: Interpretation, options: BarOptions = {}): string {
  const ascii = options.ascii === true;
  const separator = ascii ? " | " : " · ";
  const width = Math.max(10, options.width ?? 200);
  const snapshot = interpretation.snapshot;

  const segments: Segment[] = [{ text: "AWS", priority: 1 }];
  if (interpretation.state === "not-configured" || snapshot === null) {
    segments.push({ text: STATE_LABEL["not-configured"], priority: 9 });
  } else {
    const masked =
      snapshot.accountId === null
        ? null
        : options.maskAccountId === false
          ? snapshot.accountId
          : maskAccount(snapshot.accountId, ascii);
    const account =
      masked === null
        ? "account unknown"
        : interpretation.isCurrent
          ? masked
          : `last known ${masked}`;
    segments.push({ text: account, priority: 8 });
    segments.push({ text: snapshot.region ?? "region unknown", priority: 5 });
    if (options.showProfile !== false && snapshot.profile !== null) {
      segments.push({ text: `profile: ${snapshot.profile}`, priority: 2 });
    }
    segments.push({ text: snapshot.environment, priority: 7 });
    segments.push({ text: stateLabel(interpretation), priority: 9 });
  }

  const render = (list: Segment[]): string => list.map((segment) => segment.text).join(separator);
  let kept = segments;
  while (render(kept).length > width && kept.length > 1) {
    const lowest = Math.min(...kept.map((segment) => segment.priority));
    const index = kept.findIndex((segment) => segment.priority === lowest);
    kept = kept.filter((_, position) => position !== index);
  }
  const line = render(kept);
  if (line.length <= width) return line;
  const ellipsis = ascii ? "..." : "…";
  return `${line.slice(0, width - ellipsis.length)}${ellipsis}`;
}

const MAX_NAME = 40;

/**
 * Who the principal is, for display: the user name of an IAM user, the session name of an assumed
 * role (for IAM Identity Center that is the person's user name), or `root`. Null when the ARN has
 * no usable name. The ARN is untrusted input: control characters are dropped and the result is
 * bounded.
 */
export function principalName(arn: string | null): string | null {
  if (arn === null) return null;
  const parts = arn.split(":");
  if (parts.length < 6 || parts[0] !== "arn") return null;
  const resource = parts.slice(5).join(":");
  const segments = resource.split("/").filter((segment) => segment !== "");
  const kind = segments[0];
  if (kind === undefined) return null;
  let name: string | undefined;
  if (resource === "root") name = "root";
  else if (kind === "assumed-role") name = segments.length >= 3 ? segments.at(-1) : segments[1];
  else name = segments.length >= 2 ? segments.at(-1) : undefined;
  if (name === undefined) return null;
  const clean = Array.from(name)
    .filter((char) => char.charCodeAt(0) >= 0x20 && char.charCodeAt(0) !== 0x7f)
    .join("");
  if (clean === "") return null;
  return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME - 1)}…` : clean;
}

const WARNING: Partial<Record<DisplayState, string>> = {
  stale: "AWS check stale",
  expired: "AWS session expired",
  offline: "AWS offline",
  unverified: "AWS unverified",
  error: "AWS check failed",
};

export interface FooterLabels {
  /** `user · region · environment`, leaving out whatever is not known. Null when nothing is known. */
  identity: string | null;
  /** Present only when the context is not current. */
  warning: string | null;
}

/**
 * The compact form for surfaces that already have their own look (the prompt footer, a status
 * line). Shows only what is available and a warning only when there is one: a verified context
 * has no warning, and nothing at all is shown when there is no context. After a failed or old
 * check the identity is the last known one, and the warning next to it says so.
 */
export function footerLabels(interpretation: Interpretation): FooterLabels {
  const snapshot = interpretation.snapshot;
  if (snapshot === null || interpretation.state === "not-configured") {
    return { identity: null, warning: null };
  }
  const known = [
    principalName(snapshot.principalArn),
    snapshot.region,
    snapshot.environment === "unknown" ? null : snapshot.environment,
  ].filter((part): part is string => part !== null);
  return {
    identity: known.length === 0 ? null : known.join(" · "),
    warning: WARNING[interpretation.state] ?? null,
  };
}

/** One line for a status line, bounded by `width`; empty when there is nothing to say. */
export function formatFooterLine(interpretation: Interpretation, width = 100): string {
  const { identity, warning } = footerLabels(interpretation);
  const line = [identity, warning].filter((part): part is string => part !== null).join(" · ");
  return line.length <= width ? line : `${line.slice(0, Math.max(1, width - 1))}…`;
}
