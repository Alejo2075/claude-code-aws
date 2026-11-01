import { classifyError } from "@claude-code-aws/aws-client";

import type { ErrorCode, Unavailable } from "./types.js";

const ACTION = /perform:\s*([A-Za-z0-9-]+:[A-Za-z0-9*]+)/;

function text(value: unknown, key: string): string {
  if (typeof value !== "object" || value === null) return "";
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : "";
}

const HELP: Record<ErrorCode, string> = {
  NO_REGION: "No region is set. Pass --region <region>, or set AWS_REGION or a profile region.",
  NO_CREDENTIALS:
    "No AWS credentials were found. Configure a profile or environment credentials yourself, then retry.",
  CREDENTIALS_EXPIRED:
    "The AWS session expired. Sign in yourself (for example `aws sso login`), then retry.",
  CREDENTIALS_INVALID:
    "AWS rejected the credentials. Check which credentials are active, then retry.",
  ACCESS_DENIED:
    "The active identity is not allowed to make this read call. Ask for the permission named below, or use a role that has it.",
  NOT_FOUND:
    "AWS says it does not exist in this account and region. Check the name and the region.",
  UNSUPPORTED_TYPE:
    "The Cloud Control API does not support reading this resource type. Use the AWS CLI or the console.",
  THROTTLED:
    "AWS throttled the requests even after retries. Wait a moment and retry with a lower --limit.",
  TIMEOUT: "AWS did not answer in time.",
  OFFLINE: "AWS could not be reached.",
  INVALID_INPUT: "The input is not valid.",
  UNKNOWN_ERROR: "The call failed for an unrecognized reason.",
};

export function unavailable(code: ErrorCode, action?: string): Unavailable {
  return action === undefined
    ? { code, message: HELP[code] }
    : { code, message: HELP[code], action };
}

function denied(message: string): Unavailable {
  const action = ACTION.exec(message)?.[1];
  return action === undefined ? unavailable("ACCESS_DENIED") : unavailable("ACCESS_DENIED", action);
}

/**
 * Maps an SDK failure to a closed code. The error text is read only to find the name of a missing
 * IAM action; neither the message nor the error is kept.
 */
export function classifyServiceError(error: unknown): Unavailable {
  const name = text(error, "name");
  const message = text(error, "message");
  if (/^(AccessDenied|AccessDeniedException|UnauthorizedOperation)$/.test(name)) {
    return denied(message);
  }
  if (name === "ResourceNotFoundException" || name === "NotFoundException") {
    return unavailable("NOT_FOUND");
  }
  // CloudFormation reports a missing stack as a ValidationError.
  if (name === "ValidationError" && /does not exist/i.test(message))
    return unavailable("NOT_FOUND");
  if (
    name === "TypeNotFoundException" ||
    name === "UnsupportedActionException" ||
    name === "HandlerNotFoundException"
  ) {
    return unavailable("UNSUPPORTED_TYPE");
  }
  if (
    /^(Throttling|ThrottlingException|TooManyRequestsException|RequestLimitExceeded)$/.test(name)
  ) {
    return unavailable("THROTTLED");
  }
  const { code } = classifyError(error);
  switch (code) {
    case "NO_CREDENTIALS":
      return unavailable("NO_CREDENTIALS");
    case "SSO_EXPIRED":
    case "CREDENTIALS_EXPIRED":
      return unavailable("CREDENTIALS_EXPIRED");
    case "CREDENTIALS_INVALID":
      return unavailable("CREDENTIALS_INVALID");
    case "ACCESS_DENIED":
      return denied(message);
    case "OFFLINE":
      return unavailable("OFFLINE");
    case "TIMEOUT":
      return unavailable("TIMEOUT");
    default:
      return unavailable("UNKNOWN_ERROR");
  }
}
