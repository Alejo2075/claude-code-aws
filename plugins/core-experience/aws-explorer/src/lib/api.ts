// The only file that talks to AWS. Every call here is a read: ListStacks, DescribeStacks,
// ListStackResources, DescribeStackEvents, DescribeStackResource, and cloudcontrol:GetResource,
// plus the STS identity check. Tests replace the whole interface with a fake.
import { CloudControlClient, GetResourceCommand } from "@aws-sdk/client-cloudcontrol";
import {
  CloudFormationClient,
  DescribeStackEventsCommand,
  DescribeStackResourceCommand,
  DescribeStacksCommand,
  ListStackResourcesCommand,
  ListStacksCommand,
  type StackStatus,
} from "@aws-sdk/client-cloudformation";
import {
  clientDefaults,
  type Identity,
  type Page,
  verifyWithSts,
} from "@claude-code-aws/aws-client";

import type { KeyValue, StackDetail, StackEvent, StackResource, StackSummary } from "./types.js";

export interface Api {
  identity(): Promise<Identity>;
  listStacks(
    statuses: readonly string[] | undefined,
    token: string | undefined,
  ): Promise<Page<StackSummary>>;
  describeStack(name: string): Promise<StackDetail | null>;
  listStackResources(stack: string, token: string | undefined): Promise<Page<StackResource>>;
  describeStackEvents(stack: string, token: string | undefined): Promise<Page<StackEvent>>;
  describeStackResource(
    stack: string,
    logicalId: string,
  ): Promise<{ type: string; physicalId: string | null }>;
  getResource(
    type: string,
    identifier: string,
  ): Promise<{ identifier: string; properties: string | null }>;
  close(): void;
}

const iso = (date: Date | undefined): string | null =>
  date === undefined ? null : date.toISOString();

export function createAwsApi(region: string, deadlineMs: number): Api {
  const signal = AbortSignal.timeout(deadlineMs);
  const defaults = clientDefaults(region);
  const cloudformation = new CloudFormationClient(defaults);
  const cloudcontrol = new CloudControlClient(defaults);
  const options = { abortSignal: signal };

  return {
    identity: () => verifyWithSts({ region, timeoutMs: deadlineMs }),

    async listStacks(statuses, token) {
      const response = await cloudformation.send(
        new ListStacksCommand({
          NextToken: token,
          ...(statuses === undefined ? {} : { StackStatusFilter: statuses as StackStatus[] }),
        }),
        options,
      );
      return {
        items: (response.StackSummaries ?? []).map((stack) => ({
          name: stack.StackName ?? "",
          id: stack.StackId ?? "",
          status: stack.StackStatus ?? "UNKNOWN",
          created: iso(stack.CreationTime),
          updated: iso(stack.LastUpdatedTime),
          drift: stack.DriftInformation?.StackDriftStatus ?? null,
          parentId: stack.ParentId ?? null,
        })),
        next: response.NextToken,
      };
    },

    async describeStack(name) {
      const response = await cloudformation.send(
        new DescribeStacksCommand({ StackName: name }),
        options,
      );
      const stack = response.Stacks?.[0];
      if (stack === undefined) return null;
      const pairs = (
        list: ReadonlyArray<{
          key?: string | undefined;
          value?: string | undefined;
          description?: string | undefined;
        }>,
      ): KeyValue[] =>
        list.map((entry) => ({
          key: entry.key ?? "",
          value: entry.value ?? "",
          ...(entry.description === undefined ? {} : { description: entry.description }),
        }));
      return {
        name: stack.StackName ?? "",
        id: stack.StackId ?? "",
        status: stack.StackStatus ?? "UNKNOWN",
        created: iso(stack.CreationTime),
        updated: iso(stack.LastUpdatedTime),
        drift: stack.DriftInformation?.StackDriftStatus ?? null,
        parentId: stack.ParentId ?? null,
        statusReason: stack.StackStatusReason ?? null,
        description: stack.Description ?? null,
        terminationProtection: stack.EnableTerminationProtection ?? null,
        roleArn: stack.RoleARN ?? null,
        capabilities: stack.Capabilities ?? [],
        parameters: pairs(
          (stack.Parameters ?? []).map((p) => ({ key: p.ParameterKey, value: p.ParameterValue })),
        ),
        outputs: pairs(
          (stack.Outputs ?? []).map((o) => ({
            key: o.OutputKey,
            value: o.OutputValue,
            description: o.Description,
          })),
        ),
        tags: pairs((stack.Tags ?? []).map((t) => ({ key: t.Key, value: t.Value }))),
      };
    },

    async listStackResources(stack, token) {
      const response = await cloudformation.send(
        new ListStackResourcesCommand({ StackName: stack, NextToken: token }),
        options,
      );
      return {
        items: (response.StackResourceSummaries ?? []).map((resource) => ({
          logicalId: resource.LogicalResourceId ?? "",
          type: resource.ResourceType ?? "",
          physicalId: resource.PhysicalResourceId ?? null,
          status: resource.ResourceStatus ?? "UNKNOWN",
          statusReason: resource.ResourceStatusReason ?? null,
          drift: resource.DriftInformation?.StackResourceDriftStatus ?? null,
        })),
        next: response.NextToken,
      };
    },

    async describeStackEvents(stack, token) {
      const response = await cloudformation.send(
        new DescribeStackEventsCommand({ StackName: stack, NextToken: token }),
        options,
      );
      return {
        items: (response.StackEvents ?? []).map((event) => ({
          at: iso(event.Timestamp),
          logicalId: event.LogicalResourceId ?? null,
          type: event.ResourceType ?? null,
          status: event.ResourceStatus ?? null,
          reason: event.ResourceStatusReason ?? null,
        })),
        next: response.NextToken,
      };
    },

    async describeStackResource(stack, logicalId) {
      const response = await cloudformation.send(
        new DescribeStackResourceCommand({ StackName: stack, LogicalResourceId: logicalId }),
        options,
      );
      const detail = response.StackResourceDetail;
      return { type: detail?.ResourceType ?? "", physicalId: detail?.PhysicalResourceId ?? null };
    },

    async getResource(type, identifier) {
      const response = await cloudcontrol.send(
        new GetResourceCommand({ TypeName: type, Identifier: identifier }),
        options,
      );
      return {
        identifier: response.ResourceDescription?.Identifier ?? identifier,
        properties: response.ResourceDescription?.Properties ?? null,
      };
    },

    close() {
      cloudformation.destroy();
      cloudcontrol.destroy();
    },
  };
}
