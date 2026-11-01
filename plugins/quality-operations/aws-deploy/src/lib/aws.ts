// The only AWS access in the plugin: STS, and three read calls on CloudFormation. Deployment itself is
// done by `cdk deploy` from the reviewed assembly, with the credentials the user already has.
import {
  CloudFormationClient,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
} from "@aws-sdk/client-cloudformation";
import { clientDefaults, type Identity, verifyWithSts } from "@claude-code-aws/aws-client";

export interface StackState {
  name: string;
  status: string;
  reason: string | null;
  terminationProtection: boolean | null;
}

export interface EventLine {
  at: string | null;
  logicalId: string | null;
  status: string | null;
  reason: string | null;
}

export interface DeployApi {
  identity(): Promise<Identity>;
  describeStack(name: string): Promise<StackState | null>;
  getTemplate(name: string): Promise<string | null>;
  events(name: string, limit: number): Promise<EventLine[]>;
  close(): void;
}

export const DEADLINE_MS = 30_000;

const missing = (error: unknown): boolean => {
  const name = (error as { name?: string }).name;
  const message = (error as { message?: string }).message ?? "";
  return name === "ValidationError" && /does not exist/i.test(message);
};

export function createDeployApi(region: string, deadlineMs = DEADLINE_MS): DeployApi {
  const client = new CloudFormationClient(clientDefaults(region));
  const options = { abortSignal: AbortSignal.timeout(deadlineMs) };
  return {
    identity: () => verifyWithSts({ region, timeoutMs: deadlineMs }),
    async describeStack(name) {
      try {
        const stack = (await client.send(new DescribeStacksCommand({ StackName: name }), options))
          .Stacks?.[0];
        return stack === undefined
          ? null
          : {
              name: stack.StackName ?? name,
              status: stack.StackStatus ?? "UNKNOWN",
              reason: stack.StackStatusReason ?? null,
              terminationProtection: stack.EnableTerminationProtection ?? null,
            };
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async getTemplate(name) {
      try {
        return (
          (
            await client.send(
              new GetTemplateCommand({ StackName: name, TemplateStage: "Original" }),
              options,
            )
          ).TemplateBody ?? ""
        );
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async events(name, limit) {
      const response = await client.send(
        new DescribeStackEventsCommand({ StackName: name }),
        options,
      );
      return (response.StackEvents ?? []).slice(0, limit).map((event) => ({
        at: event.Timestamp?.toISOString() ?? null,
        logicalId: event.LogicalResourceId ?? null,
        status: event.ResourceStatus ?? null,
        reason: event.ResourceStatusReason ?? null,
      }));
    },
    close() {
      client.destroy();
    },
  };
}
