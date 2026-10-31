import type { Truncation } from "@claude-code-aws/aws-client";

/** Closed set of reasons a call or a whole report is unavailable. */
export type ErrorCode =
  | "NO_REGION"
  | "NO_CREDENTIALS"
  | "CREDENTIALS_EXPIRED"
  | "CREDENTIALS_INVALID"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "UNSUPPORTED_TYPE"
  | "THROTTLED"
  | "TIMEOUT"
  | "OFFLINE"
  | "INVALID_INPUT"
  | "UNKNOWN_ERROR";

export interface Unavailable {
  code: ErrorCode;
  /** Plain-language explanation and next step. Contains no account data or SDK text. */
  message: string;
  /** The IAM action AWS said was missing, for ACCESS_DENIED. */
  action?: string;
}

export interface Header {
  /** Account STS confirmed for this run. */
  accountId: string;
  principalArn: string;
  region: string;
  at: string;
  /** Set when the aws-context snapshot names a different account than this run. */
  contextNote: string | null;
}

export interface StackSummary {
  name: string;
  id: string;
  status: string;
  created: string | null;
  updated: string | null;
  drift: string | null;
  parentId: string | null;
}

export interface KeyValue {
  key: string;
  value: string;
  description?: string;
}

export interface StackDetail extends StackSummary {
  statusReason: string | null;
  description: string | null;
  terminationProtection: boolean | null;
  roleArn: string | null;
  capabilities: string[];
  parameters: KeyValue[];
  outputs: KeyValue[];
  tags: KeyValue[];
}

export interface StackResource {
  logicalId: string;
  type: string;
  physicalId: string | null;
  status: string;
  statusReason: string | null;
  drift: string | null;
}

export interface StackEvent {
  at: string | null;
  logicalId: string | null;
  type: string | null;
  status: string | null;
  reason: string | null;
}

export interface ResourceProperties {
  type: string;
  identifier: string;
  /** Redacted properties. */
  properties: unknown;
}

export type ReportData =
  | { kind: "stacks"; items: StackSummary[] }
  | { kind: "stack"; stack: StackDetail }
  | { kind: "resources"; stack: string; items: StackResource[] }
  | { kind: "events"; stack: string; items: StackEvent[] }
  | {
      kind: "resource";
      logicalId: string | null;
      stack: string | null;
      resource: ResourceProperties | null;
    };

export interface Report {
  header: Header | null;
  /** What was asked for, or why nothing could be returned. */
  data: ReportData | null;
  unavailable: Unavailable | null;
  /** A part of the answer that could not be had even though the rest was. */
  partial: Unavailable[];
  truncated: Truncation;
  limit: number;
  /** Values replaced by `[redacted]`. */
  redactedCount: number;
  notes: string[];
}
