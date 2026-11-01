import type { Page } from "@claude-code-aws/aws-client";

import type { Api } from "../src/lib/api.js";
import type { CliDeps } from "../src/lib/cli.js";
import type { StackDetail, StackEvent, StackResource, StackSummary } from "../src/lib/types.js";

export const ACCOUNT = "123456789012";
export const ARN = `arn:aws:sts::${ACCOUNT}:assumed-role/Developer/carol`;

export function failure(name: string, message = "failure"): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export const summary = (name: string, extra: Partial<StackSummary> = {}): StackSummary => ({
  name,
  id: `arn:aws:cloudformation:us-east-1:${ACCOUNT}:stack/${name}/abc`,
  status: "CREATE_COMPLETE",
  created: "2026-01-01T00:00:00.000Z",
  updated: null,
  drift: "NOT_CHECKED",
  parentId: null,
  ...extra,
});

export const detail = (name: string, extra: Partial<StackDetail> = {}): StackDetail => ({
  ...summary(name),
  statusReason: null,
  description: "An example stack",
  terminationProtection: false,
  roleArn: null,
  capabilities: ["CAPABILITY_IAM"],
  parameters: [{ key: "Stage", value: "prod" }],
  outputs: [{ key: "Url", value: "https://example.com" }],
  tags: [{ key: "Owner", value: "team" }],
  ...extra,
});

export interface Fake extends Api {
  calls: string[];
}

export interface FakeOptions {
  identity?: () => Promise<{ accountId: string; arn: string }>;
  stacks?: Array<Page<StackSummary>>;
  stack?: StackDetail | null | Error;
  resources?: Array<Page<StackResource>>;
  events?: Array<Page<StackEvent>>;
  stackResource?: { type: string; physicalId: string | null } | Error;
  resource?: { identifier: string; properties: string | null } | Error;
}

const pageAt = <T>(pages: Array<Page<T>> | undefined, token: string | undefined): Page<T> =>
  pages?.[token === undefined ? 0 : Number(token)] ?? { items: [] };

export function fakeApi(options: FakeOptions = {}): Fake {
  const calls: string[] = [];
  const settle = <T>(value: T | Error): Promise<T> =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  return {
    calls,
    identity: () => options.identity?.() ?? Promise.resolve({ accountId: ACCOUNT, arn: ARN }),
    listStacks: (statuses, token) => {
      calls.push(`listStacks:${statuses === undefined ? "all" : statuses.length}:${token ?? ""}`);
      return Promise.resolve(pageAt(options.stacks, token));
    },
    describeStack: (name) => {
      calls.push(`describeStack:${name}`);
      return settle(options.stack === undefined ? detail(name) : options.stack);
    },
    listStackResources: (stack, token) => {
      calls.push(`listStackResources:${stack}:${token ?? ""}`);
      return Promise.resolve(pageAt(options.resources, token));
    },
    describeStackEvents: (stack, token) => {
      calls.push(`describeStackEvents:${stack}:${token ?? ""}`);
      return Promise.resolve(pageAt(options.events, token));
    },
    describeStackResource: (stack, logicalId) => {
      calls.push(`describeStackResource:${stack}:${logicalId}`);
      return settle(options.stackResource ?? { type: "AWS::S3::Bucket", physicalId: "my-bucket" });
    },
    getResource: (type, identifier) => {
      calls.push(`getResource:${type}:${identifier}`);
      return settle(
        options.resource ?? { identifier, properties: JSON.stringify({ BucketName: identifier }) },
      );
    },
    close: () => {
      calls.push("close");
    },
  };
}

export function deps(api: Api, overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    sdkRegion: () => Promise.resolve("us-east-1"),
    fallbackRegion: null,
    api: () => api,
    contextAccount: () => null,
    ...overrides,
  };
}
