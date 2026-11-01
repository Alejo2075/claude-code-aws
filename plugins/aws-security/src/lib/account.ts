// Read-only checks of what an account has switched on. Each fact is read separately: a fact that
// could not be read (no permission, a service that is not available) is reported as unread and never
// as a pass or a failure, because the absence of data proves nothing.
import { type Finding, makeFinding, type Severity } from "@claude-code-aws/report-contract";

const PLUGIN = "aws-security";

export type Fact<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface TrailFacts {
  name: string;
  multiRegion: boolean;
  logging: boolean | null;
  logFileValidation: boolean;
}
export interface BucketFacts {
  name: string;
  publicAccessBlock: {
    blockPublicAcls: boolean;
    ignorePublicAcls: boolean;
    blockPublicPolicy: boolean;
    restrictPublicBuckets: boolean;
  } | null;
  policyIsPublic: boolean | null;
}
export interface KeyFacts {
  id: string;
  rotation: boolean | null;
}

export interface AccountFacts {
  rootMfa: Fact<boolean>;
  rootAccessKeys: Fact<boolean>;
  passwordPolicy: Fact<{ minimumLength: number } | null>;
  accountPublicAccessBlock: Fact<{
    blockPublicAcls: boolean;
    ignorePublicAcls: boolean;
    blockPublicPolicy: boolean;
    restrictPublicBuckets: boolean;
  } | null>;
  buckets: Fact<{ items: BucketFacts[]; truncated: boolean; total: number }>;
  trails: Fact<TrailFacts[]>;
  keys: Fact<{ items: KeyFacts[]; truncated: boolean; total: number }>;
  analyzers: Fact<{ count: number; activeFindings: number | null }>;
}

const MAX_CHECKED = 50;
const PAB_KEYS = [
  "blockPublicAcls",
  "ignorePublicAcls",
  "blockPublicPolicy",
  "restrictPublicBuckets",
] as const;

export interface AccountResult {
  findings: Finding[];
  unread: string[];
  read: string[];
}

export function analyzeAccount(
  accountId: string,
  facts: AccountFacts,
  observedAt: string,
): AccountResult {
  const findings: Finding[] = [];
  const unread: string[] = [];
  const read: string[] = [];
  const evidence = (
    what: string,
  ): Array<{ type: string; reference: string; observedAt: string }> => [
    { type: "api-call", reference: what, observedAt },
  ];
  const add = (
    ruleId: string,
    severity: Severity,
    title: string,
    explanation: string,
    subject: string,
    recommendation: string,
    what: string,
  ): void => {
    findings.push(
      makeFinding({
        ruleId,
        plugin: PLUGIN,
        severity,
        status: "confirmed",
        source: "account",
        title,
        explanation,
        affectedResources: [subject],
        subject,
        recommendation,
        evidence: evidence(what),
      }),
    );
  };
  const take = <T>(name: string, fact: Fact<T>): T | undefined => {
    if (fact.ok) {
      read.push(name);
      return fact.value;
    }
    unread.push(`${name}: ${fact.reason}`);
    return undefined;
  };

  const mfa = take("root MFA (iam:GetAccountSummary)", facts.rootMfa);
  if (mfa === false)
    add(
      "ACC-ROOT-NO-MFA",
      "critical",
      "The root user has no MFA device",
      "The root user cannot be limited by IAM policies; a stolen password gives full control of the account.",
      `account ${accountId}`,
      "Enable a hardware or passkey MFA for the root user, and keep it out of daily use.",
      "iam:GetAccountSummary",
    );
  const keys = take("root access keys (iam:GetAccountSummary)", facts.rootAccessKeys);
  if (keys === true)
    add(
      "ACC-ROOT-ACCESS-KEYS",
      "critical",
      "The root user has access keys",
      "Root access keys have unlimited power and no MFA protection.",
      `account ${accountId}`,
      "Delete the root access keys and use IAM roles or Identity Center instead.",
      "iam:GetAccountSummary",
    );
  const policy = take("password policy (iam:GetAccountPasswordPolicy)", facts.passwordPolicy);
  if (policy !== undefined && policy !== null && policy.minimumLength < 12)
    add(
      "ACC-WEAK-PASSWORD-POLICY",
      "low",
      `The IAM password policy allows ${policy.minimumLength}-character passwords`,
      "Short passwords are guessed more easily. This matters only for IAM users that sign in to the console.",
      `account ${accountId}`,
      "Require at least 12 characters, or sign in through Identity Center with MFA.",
      "iam:GetAccountPasswordPolicy",
    );

  const apab = take(
    "account S3 Block Public Access (s3:GetAccountPublicAccessBlock)",
    facts.accountPublicAccessBlock,
  );
  if (apab !== undefined && (apab === null || PAB_KEYS.some((k) => !apab[k])))
    add(
      "ACC-S3-ACCOUNT-PAB",
      "medium",
      apab === null
        ? "No account-level S3 Block Public Access is configured"
        : "Account-level S3 Block Public Access is only partly on",
      "The account-level setting is a backstop: it stops any bucket in the account from becoming public by mistake.",
      `account ${accountId}`,
      "Turn on all four account-level settings unless you host public content from S3 on purpose.",
      "s3control:GetPublicAccessBlock",
    );
  const buckets = take(
    "buckets (s3:ListAllMyBuckets, GetBucketPolicyStatus, GetPublicAccessBlock)",
    facts.buckets,
  );
  if (buckets !== undefined) {
    for (const b of buckets.items) {
      if (b.policyIsPublic === true)
        add(
          "ACC-S3-BUCKET-PUBLIC",
          "critical",
          `Bucket ${b.name} is public through its policy`,
          "S3 evaluates this bucket's policy as granting public access.",
          `bucket ${b.name}`,
          "Remove the public statement, or serve the content through CloudFront with origin access control, and turn on Block Public Access.",
          "s3:GetBucketPolicyStatus",
        );
      else if (
        b.publicAccessBlock === null &&
        apab !== undefined &&
        (apab === null || PAB_KEYS.some((k) => !apab[k]))
      )
        add(
          "ACC-S3-BUCKET-NO-PAB",
          "medium",
          `Bucket ${b.name} has no Block Public Access and the account does not block it either`,
          "Nothing prevents a mistaken policy or ACL from making this bucket public.",
          `bucket ${b.name}`,
          "Turn on all four Block Public Access settings for the bucket.",
          "s3:GetPublicAccessBlock",
        );
    }
    if (buckets.total > buckets.items.length)
      unread.push(
        `buckets: only the first ${buckets.items.length} of ${buckets.total} were checked`,
      );
  }

  const trails = take("CloudTrail (cloudtrail:DescribeTrails, GetTrailStatus)", facts.trails);
  if (trails !== undefined) {
    if (trails.length === 0)
      add(
        "ACC-NO-TRAIL",
        "high",
        "No CloudTrail trail exists",
        "Without a trail, management events beyond the 90-day event history are not kept, and there is no record to investigate an incident from. (Event history exists but cannot be exported or kept longer.)",
        `account ${accountId}`,
        "Create a multi-Region trail that delivers to an S3 bucket with log file validation.",
        "cloudtrail:DescribeTrails",
      );
    for (const t of trails) {
      if (t.logging === false)
        add(
          "ACC-TRAIL-NOT-LOGGING",
          "high",
          `Trail ${t.name} is not logging`,
          "The trail exists but is stopped.",
          `trail ${t.name}`,
          "Start logging.",
          "cloudtrail:GetTrailStatus",
        );
      if (!t.logFileValidation)
        add(
          "ACC-TRAIL-NO-VALIDATION",
          "low",
          `Trail ${t.name} has no log file validation`,
          "Tampering with delivered log files could not be detected.",
          `trail ${t.name}`,
          "Enable log file validation.",
          "cloudtrail:DescribeTrails",
        );
    }
    if (trails.length > 0 && !trails.some((t) => t.multiRegion))
      add(
        "ACC-TRAIL-SINGLE-REGION",
        "medium",
        "No trail covers all Regions",
        "Activity in other Regions is not recorded.",
        `account ${accountId}`,
        "Make one trail multi-Region.",
        "cloudtrail:DescribeTrails",
      );
  }

  const kms = take("KMS keys (kms:ListKeys, DescribeKey, GetKeyRotationStatus)", facts.keys);
  if (kms !== undefined) {
    for (const k of kms.items)
      if (k.rotation === false)
        add(
          "ACC-KMS-NO-ROTATION",
          "low",
          `Customer managed key ${k.id} has automatic rotation off`,
          "Rotation limits how much data one key version protects.",
          `key ${k.id}`,
          "Enable automatic rotation for symmetric keys unless policy says otherwise.",
          "kms:GetKeyRotationStatus",
        );
    if (kms.truncated)
      unread.push(`KMS keys: only the first ${MAX_CHECKED} of ${kms.total} were looked at`);
  }

  const analyzers = take(
    "IAM Access Analyzer (access-analyzer:ListAnalyzers, ListFindings)",
    facts.analyzers,
  );
  if (analyzers !== undefined) {
    if (analyzers.count === 0)
      add(
        "ACC-NO-ACCESS-ANALYZER",
        "medium",
        "No IAM Access Analyzer exists in this Region",
        "Nothing reports resources shared outside the account (buckets, roles, keys, queues).",
        `account ${accountId}`,
        "Create an external-access analyzer for the account or organization.",
        "access-analyzer:ListAnalyzers",
      );
    else if (analyzers.activeFindings !== null && analyzers.activeFindings > 0)
      add(
        "ACC-ANALYZER-ACTIVE-FINDINGS",
        "high",
        `${analyzers.activeFindings} active Access Analyzer finding(s)`,
        "Access Analyzer reports resources that grant access outside the account. Each may be intended or a mistake.",
        `account ${accountId}`,
        "Review each finding in the Access Analyzer console; archive the intended ones with a reason.",
        "access-analyzer:ListFindings",
      );
  }
  return { findings, unread, read };
}
