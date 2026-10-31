import { classifyError } from "@claude-code-aws/aws-client";

export interface AwsFailure {
  code: string;
  message: string;
  action?: string;
}

const ACTION = /perform:\s*([A-Za-z0-9-]+:[A-Za-z0-9*]+)/;

function field(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null) return "";
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" ? entry : "";
}

/** A closed, plain-language account of an AWS failure. The SDK's own text is never shown. */
export function classifyAwsFailure(error: unknown): AwsFailure {
  const name = field(error, "name");
  const message = field(error, "message");
  if (/^(AccessDenied|AccessDeniedException)$/.test(name)) {
    const action = ACTION.exec(message)?.[1];
    return {
      code: "ACCESS_DENIED",
      message: "The active identity is not allowed to read this stack's template.",
      ...(action === undefined ? {} : { action }),
    };
  }
  if (name === "ValidationError" && /does not exist/i.test(message)) {
    return {
      code: "NOT_FOUND",
      message:
        "That stack does not exist in this account and region. Check the name and the region.",
    };
  }
  switch (classifyError(error).code) {
    case "NO_CREDENTIALS":
      return {
        code: "NO_CREDENTIALS",
        message:
          "No AWS credentials were found. Configure a profile or environment credentials yourself, then retry.",
      };
    case "SSO_EXPIRED":
    case "CREDENTIALS_EXPIRED":
      return {
        code: "CREDENTIALS_EXPIRED",
        message:
          "The AWS session expired. Sign in yourself (for example `aws sso login`), then retry.",
      };
    case "CREDENTIALS_INVALID":
      return {
        code: "CREDENTIALS_INVALID",
        message: "AWS rejected the credentials. Check which credentials are active.",
      };
    case "OFFLINE":
      return { code: "OFFLINE", message: "AWS could not be reached." };
    case "TIMEOUT":
      return { code: "TIMEOUT", message: "AWS did not answer in time." };
    default:
      return { code: "UNKNOWN_ERROR", message: "The call failed for an unrecognized reason." };
  }
}
