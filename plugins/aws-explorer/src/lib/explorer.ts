import { collectPages, type Truncation } from "@claude-code-aws/aws-client";

import type { Api } from "./api.js";
import { classifyServiceError, unavailable } from "./errors.js";
import { createRedactor, type Redactor, sanitizeText } from "./redact.js";
import type {
  KeyValue,
  Report,
  ReportData,
  StackDetail,
  StackEvent,
  StackResource,
  StackSummary,
  Unavailable,
} from "./types.js";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;
export const DEADLINE_MS = 20_000;

/** Stack statuses, as CloudFormation reports them. `active` leaves out stacks already deleted. */
export const STACK_STATUSES = [
  "CREATE_IN_PROGRESS",
  "CREATE_FAILED",
  "CREATE_COMPLETE",
  "ROLLBACK_IN_PROGRESS",
  "ROLLBACK_FAILED",
  "ROLLBACK_COMPLETE",
  "DELETE_IN_PROGRESS",
  "DELETE_FAILED",
  "DELETE_COMPLETE",
  "UPDATE_IN_PROGRESS",
  "UPDATE_COMPLETE_CLEANUP_IN_PROGRESS",
  "UPDATE_COMPLETE",
  "UPDATE_FAILED",
  "UPDATE_ROLLBACK_IN_PROGRESS",
  "UPDATE_ROLLBACK_FAILED",
  "UPDATE_ROLLBACK_COMPLETE_CLEANUP_IN_PROGRESS",
  "UPDATE_ROLLBACK_COMPLETE",
  "REVIEW_IN_PROGRESS",
  "IMPORT_IN_PROGRESS",
  "IMPORT_COMPLETE",
  "IMPORT_ROLLBACK_IN_PROGRESS",
  "IMPORT_ROLLBACK_FAILED",
  "IMPORT_ROLLBACK_COMPLETE",
] as const;

export const ACTIVE_STATUSES = STACK_STATUSES.filter((status) => status !== "DELETE_COMPLETE");

export type Request =
  | { verb: "stacks"; statuses: readonly string[]; limit: number }
  | { verb: "stack"; stack: string }
  | { verb: "resources"; stack: string; limit: number }
  | { verb: "events"; stack: string; limit: number }
  | { verb: "resource"; type: string; identifier: string }
  | { verb: "resource-in-stack"; stack: string; logicalId: string };

interface Outcome {
  data: ReportData;
  truncated: Truncation;
  partial: Unavailable[];
  notes: string[];
}

const clean = (value: string | null): string | null =>
  value === null ? null : sanitizeText(value);

function cleanPairs(redactor: Redactor, pairs: KeyValue[]): KeyValue[] {
  return pairs.map((pair) => ({
    key: sanitizeText(pair.key),
    value: redactor.field(pair.key, pair.value),
    ...(pair.description === undefined ? {} : { description: sanitizeText(pair.description) }),
  }));
}

function cleanSummary<T extends StackSummary>(stack: T): T {
  return {
    ...stack,
    name: sanitizeText(stack.name),
    id: sanitizeText(stack.id),
    status: sanitizeText(stack.status),
    drift: clean(stack.drift),
    parentId: clean(stack.parentId),
  };
}

async function execute(
  request: Request,
  api: Api,
  redactor: Redactor,
  now: () => number,
): Promise<Outcome> {
  const limits = (limit: number) => ({ maxItems: limit, deadlineMs: DEADLINE_MS, now });
  switch (request.verb) {
    case "stacks": {
      const statuses = request.statuses;
      const found = await collectPages<StackSummary>(
        (token) => api.listStacks(statuses.length === 0 ? undefined : statuses, token),
        limits(request.limit),
      );
      return {
        data: { kind: "stacks", items: found.items.map(cleanSummary) },
        truncated: found.truncated,
        partial: [],
        notes: [],
      };
    }
    case "stack": {
      const stack = await api.describeStack(request.stack);
      if (stack === null)
        throw Object.assign(new Error("not found"), { name: "ResourceNotFoundException" });
      const detail: StackDetail = {
        ...cleanSummary(stack),
        statusReason: clean(stack.statusReason),
        description: clean(stack.description),
        terminationProtection: stack.terminationProtection,
        roleArn: clean(stack.roleArn),
        capabilities: stack.capabilities.map(sanitizeText),
        parameters: cleanPairs(redactor, stack.parameters),
        outputs: cleanPairs(redactor, stack.outputs),
        tags: cleanPairs(redactor, stack.tags),
      };
      return { data: { kind: "stack", stack: detail }, truncated: "none", partial: [], notes: [] };
    }
    case "resources": {
      const found = await collectPages<StackResource>(
        (token) => api.listStackResources(request.stack, token),
        limits(request.limit),
      );
      const items = found.items.map((resource) => ({
        logicalId: sanitizeText(resource.logicalId),
        type: sanitizeText(resource.type),
        physicalId: clean(resource.physicalId),
        status: sanitizeText(resource.status),
        statusReason: clean(resource.statusReason),
        drift: clean(resource.drift),
      }));
      return {
        data: { kind: "resources", stack: request.stack, items },
        truncated: found.truncated,
        partial: [],
        notes: [],
      };
    }
    case "events": {
      const found = await collectPages<StackEvent>(
        (token) => api.describeStackEvents(request.stack, token),
        limits(request.limit),
      );
      const items = found.items.map((event) => ({
        at: event.at,
        logicalId: clean(event.logicalId),
        type: clean(event.type),
        status: clean(event.status),
        reason: clean(event.reason),
      }));
      return {
        data: { kind: "events", stack: request.stack, items },
        truncated: found.truncated,
        partial: [],
        notes: [],
      };
    }
    case "resource":
      return getResource(api, redactor, request.type, request.identifier, null, null);
    case "resource-in-stack": {
      const detail = await api.describeStackResource(request.stack, request.logicalId);
      if (detail.type === "" || detail.physicalId === null) {
        return {
          data: {
            kind: "resource",
            logicalId: request.logicalId,
            stack: request.stack,
            resource: null,
          },
          truncated: "none",
          partial: [unavailable("NOT_FOUND")],
          notes: ["CloudFormation has no physical resource for this logical id yet."],
        };
      }
      return getResource(
        api,
        redactor,
        sanitizeText(detail.type),
        detail.physicalId,
        request.logicalId,
        request.stack,
      );
    }
  }
}

async function getResource(
  api: Api,
  redactor: Redactor,
  type: string,
  identifier: string,
  logicalId: string | null,
  stack: string | null,
): Promise<Outcome> {
  try {
    const found = await api.getResource(type, identifier);
    let properties: unknown = null;
    if (found.properties !== null) {
      try {
        properties = redactor.value(JSON.parse(found.properties) as unknown);
      } catch {
        properties = redactor.field("properties", found.properties);
      }
    }
    return {
      data: {
        kind: "resource",
        logicalId,
        stack,
        resource: {
          type: sanitizeText(type),
          identifier: sanitizeText(found.identifier),
          properties,
        },
      },
      truncated: "none",
      partial: [],
      notes: [],
    };
  } catch (error) {
    // From a stack, the stack part is already known: keep it and say the properties are missing.
    if (stack === null) throw error;
    const failure = classifyServiceError(error);
    return {
      data: {
        kind: "resource",
        logicalId,
        stack,
        resource: {
          type: sanitizeText(type),
          identifier: sanitizeText(identifier),
          properties: null,
        },
      },
      truncated: "none",
      partial: [failure],
      notes:
        failure.code === "NOT_FOUND"
          ? [
              "The stack's physical id was used as the Cloud Control identifier. For some resource types they differ, so this lookup can fail even though the resource exists.",
            ]
          : [],
    };
  }
}

export interface RunInput {
  request: Request;
  region: string | null;
  api: (region: string) => Api;
  /** Account the aws-context snapshot last verified, if any, to flag a mismatch. */
  contextAccount: string | null;
  now?: () => number;
}

const maskId = (id: string): string => `${id.slice(0, 4)}…${id.slice(-4)}`;

function limitOf(request: Request): number {
  return "limit" in request ? request.limit : 0;
}

/** Runs one request against one account and region and builds a report. Never throws. */
export async function runExplorer(input: RunInput): Promise<Report> {
  const now = input.now ?? Date.now;
  const redactor = createRedactor();
  const base: Report = {
    header: null,
    data: null,
    unavailable: null,
    partial: [],
    truncated: "none",
    limit: limitOf(input.request),
    redactedCount: 0,
    notes: [],
  };
  if (input.region === null) return { ...base, unavailable: unavailable("NO_REGION") };

  const api = input.api(input.region);
  try {
    let header: Report["header"];
    try {
      const identity = await api.identity();
      const mismatch =
        input.contextAccount !== null && input.contextAccount !== identity.accountId
          ? `aws-context last verified account ${maskId(input.contextAccount)}, but these credentials are account ${maskId(identity.accountId)}. This command uses the credentials of its own environment.`
          : null;
      header = {
        accountId: identity.accountId,
        principalArn: sanitizeText(identity.arn),
        region: input.region,
        at: new Date(now()).toISOString(),
        contextNote: mismatch,
      };
    } catch (error) {
      return { ...base, unavailable: classifyServiceError(error) };
    }
    try {
      const outcome = await execute(input.request, api, redactor, now);
      const notes = [...outcome.notes];
      if (redactor.cut())
        notes.push("Some values were shortened or left out to keep the output bounded.");
      return {
        ...base,
        header,
        data: outcome.data,
        truncated: outcome.truncated,
        partial: outcome.partial,
        redactedCount: redactor.count(),
        notes,
      };
    } catch (error) {
      return { ...base, header, unavailable: classifyServiceError(error) };
    }
  } finally {
    api.close();
  }
}
