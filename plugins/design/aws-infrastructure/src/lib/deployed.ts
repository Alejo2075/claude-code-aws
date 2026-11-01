// Reads the template CloudFormation currently has for a stack: one read-only call, after the
// account is confirmed with STS. This is the only AWS access in the plugin.
import { CloudFormationClient, GetTemplateCommand } from "@aws-sdk/client-cloudformation";
import { clientDefaults, type Identity, verifyWithSts } from "@claude-code-aws/aws-client";

export interface DeployedApi {
  identity(): Promise<Identity>;
  getTemplate(stack: string): Promise<string>;
  close(): void;
}

export const DEPLOYED_DEADLINE_MS = 20_000;

export function createDeployedApi(region: string, deadlineMs = DEPLOYED_DEADLINE_MS): DeployedApi {
  const client = new CloudFormationClient(clientDefaults(region));
  const signal = AbortSignal.timeout(deadlineMs);
  return {
    identity: () => verifyWithSts({ region, timeoutMs: deadlineMs }),
    async getTemplate(stack) {
      const response = await client.send(
        new GetTemplateCommand({ StackName: stack, TemplateStage: "Original" }),
        { abortSignal: signal },
      );
      return response.TemplateBody ?? "";
    },
    close() {
      client.destroy();
    },
  };
}
