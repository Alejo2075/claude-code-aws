import {
  type AwsContextSnapshotV1,
  classifyAccount,
  type EffectiveConfig,
  type EnvReader,
  isValidRegion,
  workspaceId,
} from "@claude-code-aws/context-contract";

import { classifyError } from "./diagnostics.js";
import type { Identity, VerifyInput } from "./sts.js";

export const DEFAULT_TIMEOUT_MS = 5000;
/** Region used only to pick an STS endpoint when none resolves. It is never reported as the region. */
const ENDPOINT_FALLBACK_REGION = "us-east-1";

export interface RefreshDeps {
  env: EnvReader;
  projectDir: string;
  now: Date;
  config: EffectiveConfig;
  /** Last snapshot for this workspace, if any. Used only to keep a last-known identity on failure. */
  prior: AwsContextSnapshotV1 | null;
  resolveSdkRegion: () => Promise<string | null>;
  verify: (input: VerifyInput) => Promise<Identity>;
  timeoutMs?: number;
}

function sanitizedProfile(env: EnvReader): string | null {
  const raw = env("AWS_PROFILE")?.trim();
  if (raw === undefined || raw === "" || raw.length > 128) return null;
  return Array.from(raw).some((char) => char.charCodeAt(0) < 0x20) ? null : raw;
}

async function resolveRegion(deps: RefreshDeps): Promise<string | null> {
  const fromSdk = await deps.resolveSdkRegion();
  if (fromSdk !== null) return fromSdk;
  // The SDK for JavaScript ignores AWS_DEFAULT_REGION; the AWS CLI honors it, so we do too.
  const fallback = deps.env("AWS_DEFAULT_REGION")?.trim();
  return fallback !== undefined && isValidRegion(fallback) ? fallback : null;
}

function isIdentity(identity: Identity): boolean {
  return /^\d{12}$/.test(identity.accountId) && identity.arn.startsWith("arn:");
}

/**
 * Resolves the current AWS context. Never throws: every failure becomes a snapshot that says what
 * is and is not known. A previous identity is carried over only for the same workspace and the
 * same named profile, and only ever with a non-`verified` state. Without a named profile (for
 * example environment credentials) nothing is carried over: those credentials may belong to a
 * different account than the last check, and the plugin must not store anything to tell.
 */
export async function refreshContext(deps: RefreshDeps): Promise<AwsContextSnapshotV1> {
  const id = await workspaceId(deps.projectDir);
  const profile = sanitizedProfile(deps.env);
  const region = await resolveRegion(deps);
  const ttlMs = deps.config.ttlMinutes * 60_000;
  const verifiedAt = deps.now.toISOString();

  try {
    const identity = await deps.verify({
      region: region ?? ENDPOINT_FALLBACK_REGION,
      timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });
    if (!isIdentity(identity)) throw new Error("unexpected identity shape");
    return {
      schemaVersion: 1,
      workspaceId: id,
      profile,
      region,
      accountId: identity.accountId,
      principalArn: identity.arn,
      environment: classifyAccount(deps.config, identity.accountId).environment,
      verification: "verified",
      verifiedAt,
      staleAfter: new Date(deps.now.getTime() + ttlMs).toISOString(),
      diagnosticCode: region === null ? "REGION_UNRESOLVED" : null,
    };
  } catch (error) {
    const { verification, code } = classifyError(error);
    const prior = deps.prior;
    const carries =
      prior !== null &&
      profile !== null &&
      prior.workspaceId === id &&
      prior.profile === profile &&
      prior.accountId !== null;
    const accountId = carries ? prior.accountId : null;
    return {
      schemaVersion: 1,
      workspaceId: id,
      profile,
      region,
      accountId,
      principalArn: carries ? prior.principalArn : null,
      environment: classifyAccount(deps.config, accountId).environment,
      verification,
      verifiedAt: carries ? prior.verifiedAt : null,
      staleAfter: carries ? prior.staleAfter : null,
      diagnosticCode: code,
    };
  }
}
