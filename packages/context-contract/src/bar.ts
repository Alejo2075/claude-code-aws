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
