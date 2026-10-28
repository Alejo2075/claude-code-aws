import type { DiagnosticCode, Verification } from "@claude-code-aws/context-contract";

export interface Classified {
  verification: Verification;
  code: DiagnosticCode;
}

const NETWORK_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EPIPE",
]);
const EXPIRED_NAMES = new Set(["ExpiredToken", "ExpiredTokenException", "RequestExpired"]);
const INVALID_NAMES = new Set([
  "InvalidClientTokenId",
  "UnrecognizedClientException",
  "SignatureDoesNotMatch",
  "InvalidSignatureException",
  "IncompleteSignature",
  "AuthFailure",
  "InvalidToken",
]);
const DENIED_NAMES = new Set(["AccessDenied", "AccessDeniedException"]);
const TIMEOUT_NAMES = new Set(["TimeoutError", "AbortError"]);

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function propertyOf(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Maps an SDK failure to a closed diagnostic code. The error's message is read only to tell an
 * expired SSO session apart from missing credentials; neither the message nor the error is kept.
 */
export function classifyError(error: unknown): Classified {
  const name = textOf(propertyOf(error, "name"));
  const message = textOf(propertyOf(error, "message"));
  const code =
    textOf(propertyOf(error, "code")) || textOf(propertyOf(propertyOf(error, "cause"), "code"));

  if (EXPIRED_NAMES.has(name)) return { verification: "expired", code: "CREDENTIALS_EXPIRED" };
  if (INVALID_NAMES.has(name)) return { verification: "error", code: "CREDENTIALS_INVALID" };
  if (DENIED_NAMES.has(name)) return { verification: "error", code: "ACCESS_DENIED" };
  if (TIMEOUT_NAMES.has(name)) return { verification: "error", code: "TIMEOUT" };
  if (name === "CredentialsProviderError" || name === "TokenProviderError") {
    return /\bsso\b/i.test(message) && /expire|invalid|refresh|login/i.test(message)
      ? { verification: "expired", code: "SSO_EXPIRED" }
      : { verification: "unverified", code: "NO_CREDENTIALS" };
  }
  if (NETWORK_CODES.has(code)) return { verification: "error", code: "OFFLINE" };
  return { verification: "error", code: "UNKNOWN_ERROR" };
}

/** What the user can do about each code. Shown by `status`; contains no account data. */
export const DIAGNOSTIC_HELP: Record<DiagnosticCode, string> = {
  NO_CREDENTIALS:
    "No AWS credentials were found. Configure a profile or environment credentials yourself (for example `aws configure sso`), then refresh.",
  SSO_EXPIRED:
    "The IAM Identity Center session expired. Sign in yourself (for example `aws sso login --profile <profile>`), then refresh. This plugin never signs in for you.",
  CREDENTIALS_EXPIRED:
    "The temporary credentials expired. Obtain new credentials yourself, then refresh.",
  CREDENTIALS_INVALID:
    "AWS rejected the credentials. Check which credentials are active (environment variables override profiles), then refresh.",
  ACCESS_DENIED:
    "AWS denied the identity check. GetCallerIdentity normally needs no permissions, so a policy or SCP is blocking it.",
  REGION_UNRESOLVED:
    "No region is configured. Set AWS_REGION or a profile region. The identity was verified through a global endpoint, but the region is unknown.",
  OFFLINE: "AWS could not be reached. The last known identity is shown as unverified.",
  TIMEOUT: "AWS did not answer in time. The last known identity is shown as unverified.",
  CONFIG_INVALID: "A configuration file is invalid and was ignored. Run `config show` for details.",
  UNKNOWN_ERROR: "The identity check failed for an unrecognized reason.",
};
