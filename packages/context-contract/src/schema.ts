import {
  type AwsContextSnapshotV1,
  DIAGNOSTIC_CODES,
  type DiagnosticCode,
  ENVIRONMENTS,
  type Environment,
  SNAPSHOT_SCHEMA_VERSION,
  VERIFICATIONS,
  type Verification,
} from "./types.js";

/** Snapshots are tiny; anything larger is corrupt or hostile and is ignored unread. */
export const MAX_SNAPSHOT_BYTES = 16 * 1024;

const KEYS: readonly string[] = [
  "schemaVersion",
  "workspaceId",
  "profile",
  "region",
  "accountId",
  "principalArn",
  "environment",
  "verification",
  "verifiedAt",
  "staleAfter",
  "diagnosticCode",
];

const WORKSPACE_ID = /^[0-9a-f]{16}$/;
const ACCOUNT_ID = /^\d{12}$/;
const REGION = /^[a-z]{2}(?:-[a-z]+)+-\d$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function isValidRegion(value: string): boolean {
  return REGION.test(value);
}

export type ParseResult =
  { ok: true; snapshot: AwsContextSnapshotV1 } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(
  value: unknown,
  test: (text: string) => boolean,
): string | null | undefined {
  if (value === null) return null;
  return typeof value === "string" && test(value) ? value : undefined;
}

function hasControlCharacter(text: string): boolean {
  return Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
}

function isIsoUtc(text: string): boolean {
  return ISO_UTC.test(text) && !Number.isNaN(Date.parse(text));
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | undefined {
  return list.find((candidate) => candidate === value);
}

/** Validates an untrusted value. Rejects unknown keys so a future field cannot leak via an old reader. */
export function validateSnapshot(value: unknown): ParseResult {
  if (!isRecord(value)) return { ok: false, reason: "not an object" };
  for (const key of Object.keys(value)) {
    if (!KEYS.includes(key)) return { ok: false, reason: "unknown key" };
  }
  for (const key of KEYS) {
    if (!(key in value)) return { ok: false, reason: `missing ${key}` };
  }
  if (value["schemaVersion"] !== SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: "unsupported schemaVersion" };
  }
  const workspaceId = value["workspaceId"];
  if (typeof workspaceId !== "string" || !WORKSPACE_ID.test(workspaceId)) {
    return { ok: false, reason: "invalid workspaceId" };
  }
  const profile = nullableString(
    value["profile"],
    (text) => text.length > 0 && text.length <= 128 && !hasControlCharacter(text),
  );
  const region = nullableString(value["region"], (text) => REGION.test(text));
  const accountId = nullableString(value["accountId"], (text) => ACCOUNT_ID.test(text));
  const principalArn = nullableString(
    value["principalArn"],
    (text) => text.startsWith("arn:") && text.length <= 2048 && !hasControlCharacter(text),
  );
  const verifiedAt = nullableString(value["verifiedAt"], isIsoUtc);
  const staleAfter = nullableString(value["staleAfter"], isIsoUtc);
  const environment: Environment | undefined = oneOf(ENVIRONMENTS, value["environment"]);
  const verification: Verification | undefined = oneOf(VERIFICATIONS, value["verification"]);
  const rawDiagnostic = value["diagnosticCode"];
  const diagnosticCode: DiagnosticCode | null | undefined =
    rawDiagnostic === null ? null : oneOf(DIAGNOSTIC_CODES, rawDiagnostic);

  if (
    profile === undefined ||
    region === undefined ||
    accountId === undefined ||
    principalArn === undefined ||
    verifiedAt === undefined ||
    staleAfter === undefined ||
    environment === undefined ||
    verification === undefined ||
    diagnosticCode === undefined
  ) {
    return { ok: false, reason: "invalid field" };
  }
  // A snapshot may only claim `verified` when it carries the evidence for it.
  if (
    verification === "verified" &&
    (accountId === null || verifiedAt === null || staleAfter === null)
  ) {
    return { ok: false, reason: "verified without evidence" };
  }
  if (accountId === null && environment !== "unknown") {
    return { ok: false, reason: "environment without account" };
  }
  return {
    ok: true,
    snapshot: {
      schemaVersion: 1,
      workspaceId,
      profile,
      region,
      accountId,
      principalArn,
      environment,
      verification,
      verifiedAt,
      staleAfter,
      diagnosticCode,
    },
  };
}

/** Parses snapshot file text. Corrupt, oversized, or old-schema content yields no snapshot. */
export function parseSnapshot(text: string): ParseResult {
  if (text.length > MAX_SNAPSHOT_BYTES) return { ok: false, reason: "too large" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid JSON" };
  }
  return validateSnapshot(value);
}

export function serializeSnapshot(snapshot: AwsContextSnapshotV1): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}
