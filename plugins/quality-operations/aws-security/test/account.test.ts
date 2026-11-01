import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type AccountFacts, analyzeAccount, type Fact } from "../src/lib/account.js";
import type { AccountApi } from "../src/lib/account-api.js";
import { runCli } from "../src/lib/cli.js";
import { deps } from "./helpers.js";

const ok = <T>(value: T): Fact<T> => ({ ok: true, value });
const pab = (on: boolean) => ({
  blockPublicAcls: on,
  ignorePublicAcls: on,
  blockPublicPolicy: on,
  restrictPublicBuckets: on,
});
const healthy = (): AccountFacts => ({
  rootMfa: ok(true),
  rootAccessKeys: ok(false),
  passwordPolicy: ok({ minimumLength: 14 }),
  accountPublicAccessBlock: ok(pab(true)),
  buckets: ok({
    items: [{ name: "b", publicAccessBlock: pab(true), policyIsPublic: false }],
    truncated: false,
    total: 1,
  }),
  trails: ok([{ name: "t", multiRegion: true, logging: true, logFileValidation: true }]),
  keys: ok({ items: [{ id: "k", rotation: true }], truncated: false, total: 1 }),
  analyzers: ok({ count: 1, activeFindings: 0 }),
});
const ids = (f: AccountFacts) =>
  analyzeAccount("111122223333", f, "2026-11-01T00:00:00Z").findings.map((x) => x.ruleId);

describe("account analysis", () => {
  it("a healthy account has no findings and nothing unread", () => {
    const r = analyzeAccount("111122223333", healthy(), "t");
    expect(r.findings).toEqual([]);
    expect(r.unread).toEqual([]);
    expect(r.read).toHaveLength(8);
  });

  it("finds each documented problem", () => {
    const bad: AccountFacts = {
      rootMfa: ok(false),
      rootAccessKeys: ok(true),
      passwordPolicy: ok({ minimumLength: 8 }),
      accountPublicAccessBlock: ok(null),
      buckets: ok({
        items: [
          { name: "open", publicAccessBlock: null, policyIsPublic: true },
          { name: "plain", publicAccessBlock: null, policyIsPublic: false },
        ],
        truncated: false,
        total: 2,
      }),
      trails: ok([{ name: "t", multiRegion: false, logging: false, logFileValidation: false }]),
      keys: ok({ items: [{ id: "k", rotation: false }], truncated: false, total: 1 }),
      analyzers: ok({ count: 1, activeFindings: 3 }),
    };
    for (const id of [
      "ACC-ROOT-NO-MFA",
      "ACC-ROOT-ACCESS-KEYS",
      "ACC-WEAK-PASSWORD-POLICY",
      "ACC-S3-ACCOUNT-PAB",
      "ACC-S3-BUCKET-PUBLIC",
      "ACC-S3-BUCKET-NO-PAB",
      "ACC-TRAIL-NOT-LOGGING",
      "ACC-TRAIL-NO-VALIDATION",
      "ACC-TRAIL-SINGLE-REGION",
      "ACC-KMS-NO-ROTATION",
      "ACC-ANALYZER-ACTIVE-FINDINGS",
    ])
      expect(ids(bad), id).toContain(id);
    expect(ids({ ...healthy(), trails: ok([]) })).toContain("ACC-NO-TRAIL");
    expect(ids({ ...healthy(), analyzers: ok({ count: 0, activeFindings: null }) })).toContain(
      "ACC-NO-ACCESS-ANALYZER",
    );
  });

  it("does not treat a bucket without its own block as a problem when the account blocks public access", () => {
    const f = {
      ...healthy(),
      buckets: ok({
        items: [{ name: "b", publicAccessBlock: null, policyIsPublic: false }],
        truncated: false,
        total: 1,
      }),
    };
    expect(ids(f)).toEqual([]);
  });

  it("a fact that could not be read is reported as unread, never as a pass or a failure", () => {
    const denied: Fact<never> = { ok: false, reason: "ACCESS_DENIED" };
    const r = analyzeAccount(
      "111122223333",
      { ...healthy(), rootMfa: denied, trails: denied, keys: denied },
      "t",
    );
    expect(r.findings).toEqual([]);
    expect(r.unread).toHaveLength(3);
    expect(r.unread[0]).toMatch(/root MFA.*ACCESS_DENIED/);
  });

  it("says when only part of a long list was looked at", () => {
    const r = analyzeAccount(
      "111122223333",
      { ...healthy(), buckets: ok({ items: [], truncated: true, total: 300 }) },
      "t",
    );
    expect(r.unread.join(" ")).toMatch(/only the first 0 of 300/);
  });

  it("findings are read facts from the account with their call as evidence", () => {
    const f = analyzeAccount(
      "111122223333",
      { ...healthy(), rootMfa: ok(false) },
      "2026-11-01T00:00:00Z",
    ).findings[0];
    expect(f?.source).toBe("account");
    expect(f?.status).toBe("confirmed");
    expect(f?.evidence[0]).toMatchObject({ type: "api-call", reference: "iam:GetAccountSummary" });
  });
});

describe("the account command", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "aws-sec-acc-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const fake = (
    facts: AccountFacts,
    identity: () => Promise<{ accountId: string; arn: string }>,
  ): { api: AccountApi; closed: () => boolean } => {
    let closed = false;
    return {
      api: {
        identity,
        facts: () => Promise.resolve({ facts, calls: 12 }),
        close: () => void (closed = true),
      },
      closed: () => closed,
    };
  };
  const withApi = (api: AccountApi) => ({
    ...deps(root),
    account: { api: () => api, sdkRegion: () => Promise.resolve("us-east-1"), known: () => null },
  });

  it("verifies the identity first and reports read-only cloud mode", async () => {
    const f = fake({ ...healthy(), rootMfa: ok(false) }, () =>
      Promise.resolve({ accountId: "111122223333", arn: "arn:aws:iam::111122223333:user/x" }),
    );
    const r = await runCli(["account", "--json"], withApi(f.api));
    const report = JSON.parse(r.stdout) as {
      mode: string;
      context: { identityVerified: boolean; accountId: string };
      findings: Array<{ ruleId: string }>;
      limitations: string[];
    };
    expect(report.mode).toBe("read-only-cloud");
    expect(report.context).toMatchObject({ identityVerified: true, accountId: "111122223333" });
    expect(report.findings.map((x) => x.ruleId)).toEqual(["ACC-ROOT-NO-MFA"]);
    expect(report.limitations.join(" ")).toMatch(/12 API read call/);
    expect(f.closed()).toBe(true);
  });

  it("makes no account check when the identity cannot be verified", async () => {
    let read = false;
    const api: AccountApi = {
      identity: () => Promise.reject(new Error("expired")),
      facts: () => {
        read = true;
        return Promise.reject(new Error("never"));
      },
      close: () => undefined,
    };
    const r = await runCli(["account"], withApi(api));
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/could not be verified/);
    expect(read).toBe(false);
  });

  it("rejects a bad region and works as unavailable without an adapter", async () => {
    const f = fake(healthy(), () => Promise.resolve({ accountId: "1", arn: "a" }));
    expect((await runCli(["account", "--region", "mars"], withApi(f.api))).exitCode).toBe(2);
    expect((await runCli(["account"], deps(root))).exitCode).toBe(2);
  });
});
