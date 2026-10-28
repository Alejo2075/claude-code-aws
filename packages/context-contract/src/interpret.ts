import type { AwsContextSnapshotV1 } from "./types.js";

export type DisplayState =
  "not-configured" | "verified" | "stale" | "expired" | "offline" | "error" | "unverified";

export interface Interpretation {
  state: DisplayState;
  snapshot: AwsContextSnapshotV1 | null;
  /** True only for `verified`: the account is the current, verified identity. */
  isCurrent: boolean;
}

/** Tolerance for a snapshot written by a machine whose clock runs slightly ahead. */
const FUTURE_SKEW_MS = 60_000;

/** The single place that decides how a snapshot may be presented. Consumers must not re-derive it. */
export function interpret(
  snapshot: AwsContextSnapshotV1 | null,
  now: Date | number,
): Interpretation {
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (snapshot === null) return { state: "not-configured", snapshot: null, isCurrent: false };
  const make = (state: DisplayState): Interpretation => ({
    state,
    snapshot,
    isCurrent: state === "verified",
  });
  if (
    snapshot.verification !== "verified" &&
    snapshot.diagnosticCode === "NO_CREDENTIALS" &&
    snapshot.profile === null &&
    snapshot.accountId === null
  ) {
    return make("not-configured");
  }
  if (snapshot.verification === "expired") return make("expired");
  if (snapshot.verification === "error") {
    return make(
      snapshot.diagnosticCode === "OFFLINE" || snapshot.diagnosticCode === "TIMEOUT"
        ? "offline"
        : "error",
    );
  }
  if (snapshot.verification === "unverified") return make("unverified");
  // verified: only current while inside its window, and only if its timestamps are plausible.
  const staleAfterMs = snapshot.staleAfter === null ? Number.NaN : Date.parse(snapshot.staleAfter);
  const verifiedAtMs = snapshot.verifiedAt === null ? Number.NaN : Date.parse(snapshot.verifiedAt);
  if (
    Number.isNaN(staleAfterMs) ||
    Number.isNaN(verifiedAtMs) ||
    nowMs > staleAfterMs ||
    verifiedAtMs > nowMs + FUTURE_SKEW_MS
  ) {
    return make("stale");
  }
  return make("verified");
}
