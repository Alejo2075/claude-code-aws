import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { isValidRegion } from "@claude-code-aws/context-contract";

export interface Identity {
  accountId: string;
  arn: string;
}

export interface VerifyInput {
  region: string;
  timeoutMs: number;
}

/** Region according to the SDK's own resolution (AWS_REGION, then the selected profile). */
export async function resolveSdkRegion(): Promise<string | null> {
  const probe = new STSClient({});
  try {
    const region = await probe.config.region();
    return isValidRegion(region) ? region : null;
  } catch {
    return null;
  } finally {
    probe.destroy();
  }
}

/**
 * The only AWS call this plugin makes: sts:GetCallerIdentity, through the SDK's default credential
 * provider chain. It needs no IAM permissions and reads no credential file itself.
 */
export async function verifyWithSts(input: VerifyInput): Promise<Identity> {
  const client = new STSClient({ region: input.region, maxAttempts: 2 });
  try {
    const response = await client.send(new GetCallerIdentityCommand({}), {
      abortSignal: AbortSignal.timeout(input.timeoutMs),
    });
    return { accountId: response.Account ?? "", arn: response.Arn ?? "" };
  } finally {
    client.destroy();
  }
}
