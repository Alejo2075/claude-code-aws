// The only AWS access of `account`: read calls on IAM, S3, S3 Control, CloudTrail, KMS, and IAM
// Access Analyzer (plus STS GetCallerIdentity). Nothing here can change an account.
import {
  ListAnalyzersCommand,
  AccessAnalyzerClient,
  ListFindingsV2Command,
} from "@aws-sdk/client-accessanalyzer";
import {
  CloudTrailClient,
  DescribeTrailsCommand,
  GetTrailStatusCommand,
} from "@aws-sdk/client-cloudtrail";
import {
  GetAccountPasswordPolicyCommand,
  GetAccountSummaryCommand,
  IAMClient,
} from "@aws-sdk/client-iam";
import {
  DescribeKeyCommand,
  GetKeyRotationStatusCommand,
  KMSClient,
  ListKeysCommand,
} from "@aws-sdk/client-kms";
import {
  GetBucketPolicyStatusCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  GetPublicAccessBlockCommand as GetAccountPabCommand,
  S3ControlClient,
} from "@aws-sdk/client-s3-control";
import {
  classifyError,
  clientDefaults,
  type Identity,
  verifyWithSts,
} from "@claude-code-aws/aws-client";

import type { AccountFacts, BucketFacts, Fact, KeyFacts, TrailFacts } from "./account.js";

export interface AccountApi {
  identity(): Promise<Identity>;
  facts(accountId: string): Promise<{ facts: AccountFacts; calls: number }>;
  close(): void;
}

const MAX_ITEMS = 50;
const DEADLINE_MS = 15_000;

async function fact<T>(fn: () => Promise<T>): Promise<Fact<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const c = classifyError(error);
    return {
      ok: false,
      reason:
        c.code === "UNKNOWN_ERROR"
          ? `the call failed (${error instanceof Error ? error.name : "error"})`
          : c.code,
    };
  }
}

const named = (error: unknown, ...names: string[]): boolean =>
  error instanceof Error && names.includes(error.name);

export function createAccountApi(region: string): AccountApi {
  const defaults = clientDefaults(region);
  const iam = new IAMClient({ ...defaults, region: "us-east-1" });
  const s3 = new S3Client({ ...defaults, region: "us-east-1" });
  const s3c = new S3ControlClient(defaults);
  const trail = new CloudTrailClient(defaults);
  const kms = new KMSClient(defaults);
  const analyzer = new AccessAnalyzerClient(defaults);
  const o = (): { abortSignal: AbortSignal } => ({ abortSignal: AbortSignal.timeout(DEADLINE_MS) });
  let calls = 0;
  const counted = <T>(p: Promise<T>): Promise<T> => {
    calls += 1;
    return p;
  };
  return {
    identity: () => verifyWithSts({ region, timeoutMs: DEADLINE_MS }),
    close() {
      for (const c of [iam, s3, s3c, trail, kms, analyzer]) c.destroy();
    },
    async facts(accountId) {
      calls = 0;
      const summary = await fact(() => counted(iam.send(new GetAccountSummaryCommand({}), o())));
      const facts: AccountFacts = {
        rootMfa: summary.ok
          ? { ok: true, value: summary.value.SummaryMap?.["AccountMFAEnabled"] === 1 }
          : summary,
        rootAccessKeys: summary.ok
          ? { ok: true, value: (summary.value.SummaryMap?.["AccountAccessKeysPresent"] ?? 0) > 0 }
          : summary,
        passwordPolicy: await fact(async () => {
          try {
            const r = await counted(iam.send(new GetAccountPasswordPolicyCommand({}), o()));
            return { minimumLength: r.PasswordPolicy?.MinimumPasswordLength ?? 6 };
          } catch (error) {
            if (named(error, "NoSuchEntityException")) return null;
            throw error;
          }
        }),
        accountPublicAccessBlock: await fact(async () => {
          try {
            const r = await counted(
              s3c.send(new GetAccountPabCommand({ AccountId: accountId }), o()),
            );
            const c = r.PublicAccessBlockConfiguration;
            return {
              blockPublicAcls: c?.BlockPublicAcls === true,
              ignorePublicAcls: c?.IgnorePublicAcls === true,
              blockPublicPolicy: c?.BlockPublicPolicy === true,
              restrictPublicBuckets: c?.RestrictPublicBuckets === true,
            };
          } catch (error) {
            if (named(error, "NoSuchPublicAccessBlockConfiguration")) return null;
            throw error;
          }
        }),
        buckets: await fact(async () => {
          const list = await counted(s3.send(new ListBucketsCommand({}), o()));
          const all = list.Buckets ?? [];
          const items: BucketFacts[] = [];
          for (const b of all.slice(0, MAX_ITEMS)) {
            const name = b.Name ?? "";
            let pab: BucketFacts["publicAccessBlock"] = null;
            let isPublic: boolean | null = null;
            try {
              const r = await counted(
                s3.send(new GetPublicAccessBlockCommand({ Bucket: name }), o()),
              );
              const c = r.PublicAccessBlockConfiguration;
              pab = {
                blockPublicAcls: c?.BlockPublicAcls === true,
                ignorePublicAcls: c?.IgnorePublicAcls === true,
                blockPublicPolicy: c?.BlockPublicPolicy === true,
                restrictPublicBuckets: c?.RestrictPublicBuckets === true,
              };
            } catch (error) {
              if (!named(error, "NoSuchPublicAccessBlockConfiguration")) pab = null;
            }
            try {
              const r = await counted(
                s3.send(new GetBucketPolicyStatusCommand({ Bucket: name }), o()),
              );
              isPublic = r.PolicyStatus?.IsPublic ?? null;
            } catch (error) {
              if (named(error, "NoSuchBucketPolicy")) isPublic = false;
            }
            items.push({ name, publicAccessBlock: pab, policyIsPublic: isPublic });
          }
          return { items, total: all.length, truncated: all.length > MAX_ITEMS };
        }),
        trails: await fact(async () => {
          const r = await counted(trail.send(new DescribeTrailsCommand({}), o()));
          const out: TrailFacts[] = [];
          for (const t of r.trailList ?? []) {
            let logging: boolean | null;
            try {
              const s = await counted(
                trail.send(new GetTrailStatusCommand({ Name: t.TrailARN ?? t.Name ?? "" }), o()),
              );
              logging = s.IsLogging ?? null;
            } catch {
              logging = null;
            }
            out.push({
              name: t.Name ?? "trail",
              multiRegion: t.IsMultiRegionTrail === true,
              logging,
              logFileValidation: t.LogFileValidationEnabled === true,
            });
          }
          return out;
        }),
        keys: await fact(async () => {
          const list = await counted(kms.send(new ListKeysCommand({ Limit: 100 }), o()));
          const all = list.Keys ?? [];
          const items: KeyFacts[] = [];
          for (const k of all.slice(0, MAX_ITEMS)) {
            const id = k.KeyId ?? "";
            try {
              const d = await counted(kms.send(new DescribeKeyCommand({ KeyId: id }), o()));
              const m = d.KeyMetadata;
              if (
                m?.KeyManager !== "CUSTOMER" ||
                m.KeySpec !== "SYMMETRIC_DEFAULT" ||
                m.KeyState !== "Enabled" ||
                m.Origin !== "AWS_KMS"
              )
                continue;
              const r = await counted(
                kms.send(new GetKeyRotationStatusCommand({ KeyId: id }), o()),
              );
              items.push({ id, rotation: r.KeyRotationEnabled ?? null });
            } catch {
              items.push({ id, rotation: null });
            }
          }
          return { items, total: all.length, truncated: all.length > MAX_ITEMS };
        }),
        analyzers: await fact(async () => {
          const list = await counted(
            analyzer.send(new ListAnalyzersCommand({ type: "ACCOUNT" }), o()),
          );
          const first = list.analyzers?.[0];
          if (first?.arn === undefined) return { count: 0, activeFindings: null };
          try {
            const f = await counted(
              analyzer.send(
                new ListFindingsV2Command({
                  analyzerArn: first.arn,
                  filter: { status: { eq: ["ACTIVE"] } },
                  maxResults: 100,
                }),
                o(),
              ),
            );
            return { count: list.analyzers?.length ?? 1, activeFindings: f.findings?.length ?? 0 };
          } catch {
            return { count: list.analyzers?.length ?? 1, activeFindings: null };
          }
        }),
      };
      return { facts, calls };
    },
  };
}
