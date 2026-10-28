import { describe, expect, it } from "vitest";

import {
  claudeConfigDir,
  classifyAccount,
  footerLabels,
  formatBar,
  formatFooterLine,
  interpret,
  maskAccount,
  mergeConfig,
  normalizeWorkspacePath,
  parseConfig,
  parseSnapshot,
  principalName,
  projectConfigPath,
  serializeSnapshot,
  snapshotPath,
  toneOf,
  trimTrailingSeparators,
  userConfigPath,
  validateSnapshot,
  workspaceId,
} from "../src/index.js";
import { snapshot, STALE_AFTER, VERIFIED_AT } from "./fixtures.js";

const at = (iso: string): number => Date.parse(iso);

describe("snapshot schema", () => {
  it("round-trips a valid snapshot", () => {
    const parsed = parseSnapshot(serializeSnapshot(snapshot()));
    expect(parsed).toEqual({ ok: true, snapshot: snapshot() });
  });

  it.each([
    ["extra key", { ...snapshot(), token: "x" }],
    ["wrong version", { ...snapshot(), schemaVersion: 2 }],
    ["short account", snapshot({ accountId: "12345678901" })],
    ["bad region", snapshot({ region: "US_EAST" })],
    ["path as workspace id", snapshot({ workspaceId: "/home/me/project" })],
    ["unknown verification", { ...snapshot(), verification: "trusted" }],
    ["unknown diagnostic", { ...snapshot(), diagnosticCode: "BOOM" }],
    ["bad timestamp", snapshot({ verifiedAt: "yesterday" })],
    ["non-arn principal", snapshot({ principalArn: "not-an-arn" })],
    ["verified without account", snapshot({ accountId: null, environment: "unknown" })],
    ["verified without time", snapshot({ verifiedAt: null })],
    ["environment without account", snapshot({ accountId: null, verification: "error" })],
  ])("rejects %s", (_name, value) => {
    expect(validateSnapshot(value).ok).toBe(false);
  });

  it("rejects missing keys, non-objects, bad JSON, and oversized input", () => {
    const partial: Record<string, unknown> = { ...snapshot() };
    delete partial["profile"];
    expect(validateSnapshot(partial).ok).toBe(false);
    expect(validateSnapshot([]).ok).toBe(false);
    expect(validateSnapshot(null).ok).toBe(false);
    expect(parseSnapshot("{not json").ok).toBe(false);
    expect(parseSnapshot(" ".repeat(20_000)).ok).toBe(false);
  });

  it("accepts a failed state that keeps the last known account", () => {
    const failed = snapshot({ verification: "expired", diagnosticCode: "SSO_EXPIRED" });
    expect(validateSnapshot(failed).ok).toBe(true);
  });
});

describe("locations", () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it("prefers CLAUDE_CONFIG_DIR, then USERPROFILE, then HOME", () => {
    expect(claudeConfigDir(env({ CLAUDE_CONFIG_DIR: "/cfg/", HOME: "/h" }))).toBe("/cfg");
    expect(claudeConfigDir(env({ USERPROFILE: "C:\\Users\\me", HOME: "/c/Users/me" }))).toBe(
      "C:\\Users\\me/.claude",
    );
    expect(claudeConfigDir(env({ HOME: "/home/me/" }))).toBe("/home/me/.claude");
    expect(claudeConfigDir(env({}))).toBeNull();
    expect(claudeConfigDir(env({ HOME: "  " }))).toBeNull();
  });

  it("derives snapshot and config paths", () => {
    const e = env({ HOME: "/home/me" });
    expect(snapshotPath(e, "0123456789abcdef")).toBe(
      "/home/me/.claude/aws-context/v1/0123456789abcdef.json",
    );
    expect(userConfigPath(e)).toBe("/home/me/.claude/aws-context/config.json");
    expect(snapshotPath(env({}), "0123456789abcdef")).toBeNull();
    expect(projectConfigPath("/repo/")).toBe("/repo/.aws-context.json");
  });
});

describe("workspace id", () => {
  it("is 16 hex characters and never contains the path", async () => {
    const id = await workspaceId("/Users/me/secret-project");
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(id).not.toContain("secret");
  });

  it("is stable across trailing separators and differs between directories", async () => {
    expect(await workspaceId("/repo/a")).toBe(await workspaceId("/repo/a/"));
    expect(await workspaceId("/repo/a")).not.toBe(await workspaceId("/repo/b"));
  });

  it("normalizes Windows separators and case, but keeps POSIX case", async () => {
    expect(normalizeWorkspacePath("C:\\Repo\\App\\")).toBe("c:/repo/app");
    expect(await workspaceId("C:\\Repo\\App")).toBe(await workspaceId("c:/repo/app/"));
    expect(await workspaceId("/Repo")).not.toBe(await workspaceId("/repo"));
    expect(normalizeWorkspacePath("/")).toBe("/");
  });
});

describe("configuration", () => {
  const valid = JSON.stringify({
    version: 1,
    ttlMinutes: 10,
    accounts: { "123456789012": { environment: "production" } },
    ui: { maskAccountId: false },
  });

  it("parses a valid file", () => {
    const parsed = parseConfig(valid, "user");
    expect(parsed.warnings).toEqual([]);
    expect(parsed.layer).toMatchObject({
      ttlMinutes: 10,
      maskAccountId: false,
      accounts: { "123456789012": "production" },
    });
  });

  it.each([
    ["invalid JSON", "{nope"],
    ["array", "[]"],
    ["wrong version", JSON.stringify({ version: 2 })],
  ])("ignores a file that is %s", (_name, text) => {
    const parsed = parseConfig(text, "project");
    expect(parsed.layer.accounts).toEqual({});
    expect(parsed.warnings).toHaveLength(1);
  });

  it("drops bad entries with warnings and keeps good ones", () => {
    const parsed = parseConfig(
      JSON.stringify({
        version: 1,
        ttlMinutes: 999,
        extra: true,
        accounts: {
          prod: { environment: "production" },
          "210987654321": { environment: "staging" },
          "111111111111": { environment: "non-production" },
        },
        ui: { showProfile: "yes", other: 1 },
      }),
      "user",
    );
    expect(parsed.layer.accounts).toEqual({ "111111111111": "non-production" });
    expect(parsed.layer.ttlMinutes).toBeUndefined();
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(5);
    // The untrusted key text is never echoed back.
    expect(parsed.warnings.join("\n")).not.toContain("prod:");
  });

  it("ignores an oversized file", () => {
    expect(parseConfig(" ".repeat(70_000), "user").warnings).toHaveLength(1);
  });

  it("merges with defaults", () => {
    expect(mergeConfig(undefined, undefined)).toMatchObject({
      ttlMinutes: 5,
      maskAccountId: true,
      showProfile: true,
    });
  });

  it("takes preferences from the user file only, ignoring them in the project file", () => {
    const user = parseConfig(JSON.stringify({ version: 1, ui: { maskAccountId: true } }), "user");
    const project = parseConfig(
      JSON.stringify({ version: 1, ttlMinutes: 60, ui: { maskAccountId: false } }),
      "project",
    );
    expect(project.warnings).toHaveLength(2);
    expect(mergeConfig(user, project)).toMatchObject({ ttlMinutes: 5, maskAccountId: true });
    // Even when the user file sets nothing, the repository cannot unmask or extend the window.
    expect(mergeConfig(undefined, project)).toMatchObject({ ttlMinutes: 5, maskAccountId: true });
  });

  describe("classification trust rule", () => {
    const account = "123456789012";
    const layer = (source: "user" | "project", environment: string) =>
      parseConfig(JSON.stringify({ version: 1, accounts: { [account]: { environment } } }), source);

    it("never classifies without an account", () => {
      expect(classifyAccount(mergeConfig(layer("user", "production"), undefined), null)).toEqual({
        environment: "unknown",
        basis: "default",
      });
    });

    it("trusts production from either file", () => {
      expect(classifyAccount(mergeConfig(layer("user", "production"), undefined), account)).toEqual(
        {
          environment: "production",
          basis: "user",
        },
      );
      expect(
        classifyAccount(mergeConfig(undefined, layer("project", "production")), account),
      ).toEqual({
        environment: "production",
        basis: "project",
      });
    });

    it("trusts non-production only from the user file", () => {
      expect(
        classifyAccount(mergeConfig(layer("user", "non-production"), undefined), account)
          .environment,
      ).toBe("non-production");
      expect(
        classifyAccount(mergeConfig(undefined, layer("project", "non-production")), account),
      ).toEqual({
        environment: "unknown",
        basis: "default",
        ignoredProjectClaim: "non-production",
      });
    });

    it("lets a repository raise but never lower what the user marked production", () => {
      const config = mergeConfig(layer("user", "production"), layer("project", "non-production"));
      expect(classifyAccount(config, account).environment).toBe("production");
    });

    it("keeps unlisted accounts unknown", () => {
      expect(
        classifyAccount(mergeConfig(layer("user", "production"), undefined), "999999999999"),
      ).toEqual({
        environment: "unknown",
        basis: "default",
      });
    });
  });
});

describe("interpret", () => {
  const fresh = at("2026-01-01T12:01:00.000Z");

  it("has no state without a snapshot", () => {
    expect(interpret(null, fresh)).toEqual({
      state: "not-configured",
      snapshot: null,
      isCurrent: false,
    });
  });

  it("is verified only inside the window, and stale at and after the boundary", () => {
    expect(interpret(snapshot(), fresh)).toMatchObject({ state: "verified", isCurrent: true });
    expect(interpret(snapshot(), at(STALE_AFTER)).state).toBe("verified");
    expect(interpret(snapshot(), at(STALE_AFTER) + 1)).toMatchObject({
      state: "stale",
      isCurrent: false,
    });
  });

  it("does not trust a verification from the future", () => {
    expect(interpret(snapshot(), at(VERIFIED_AT) - 5 * 60_000).state).toBe("stale");
    expect(interpret(snapshot(), at(VERIFIED_AT) - 30_000).state).toBe("verified");
  });

  it("maps failure states", () => {
    const base = { verification: "error" as const };
    expect(interpret(snapshot({ ...base, diagnosticCode: "OFFLINE" }), fresh).state).toBe(
      "offline",
    );
    expect(interpret(snapshot({ ...base, diagnosticCode: "TIMEOUT" }), fresh).state).toBe(
      "offline",
    );
    expect(interpret(snapshot({ ...base, diagnosticCode: "UNKNOWN_ERROR" }), fresh).state).toBe(
      "error",
    );
    expect(
      interpret(snapshot({ verification: "expired", diagnosticCode: "SSO_EXPIRED" }), fresh),
    ).toMatchObject({ state: "expired", isCurrent: false });
    expect(interpret(snapshot({ verification: "unverified" }), fresh).state).toBe("unverified");
  });

  it("reports not configured when nothing was ever configured", () => {
    const empty = snapshot({
      profile: null,
      accountId: null,
      principalArn: null,
      environment: "unknown",
      verification: "error",
      verifiedAt: null,
      staleAfter: null,
      diagnosticCode: "NO_CREDENTIALS",
    });
    expect(interpret(empty, fresh).state).toBe("not-configured");
    expect(interpret({ ...empty, profile: "dev" }, fresh).state).toBe("error");
  });
});

describe("formatBar", () => {
  const fresh = at("2026-01-01T12:01:00.000Z");
  const bar = (value: Parameters<typeof interpret>[0], options = {}, now = fresh) =>
    formatBar(interpret(value, now), options);

  it("shows account, region, environment and state, masked by default", () => {
    expect(bar(snapshot({ profile: null, environment: "production" }))).toBe(
      "AWS · 1234…9012 · us-east-1 · production · verified",
    );
  });

  it("includes the profile when asked and allowed", () => {
    expect(bar(snapshot())).toContain("profile: dev");
    expect(bar(snapshot(), { showProfile: false })).not.toContain("profile");
  });

  it("unmasks only on request", () => {
    expect(bar(snapshot(), { maskAccountId: false })).toContain("123456789012");
    expect(bar(snapshot())).not.toContain("123456789012");
  });

  it("never shows a non-current account as current", () => {
    for (const value of [
      snapshot({ verification: "expired", diagnosticCode: "SSO_EXPIRED" }),
      snapshot({ verification: "error", diagnosticCode: "OFFLINE" }),
      snapshot({ verification: "unverified" }),
    ]) {
      expect(bar(value)).toContain("last known 1234…9012");
    }
    expect(bar(snapshot(), {}, at(STALE_AFTER) + 1)).toContain("last known");
    expect(bar(snapshot(), {}, at(STALE_AFTER) + 1)).toContain("stale");
  });

  it("spells out unknown pieces", () => {
    const unknown = snapshot({
      region: null,
      accountId: null,
      principalArn: null,
      environment: "unknown",
      verification: "unverified",
      profile: null,
      verifiedAt: null,
      staleAfter: null,
    });
    expect(bar(unknown)).toBe("AWS · account unknown · region unknown · unknown · unverified");
  });

  it("renders the empty state", () => {
    expect(bar(null)).toBe("AWS · not configured");
  });

  it("uses ASCII when asked", () => {
    const line = bar(snapshot({ profile: null }), { ascii: true });
    expect(line).toBe("AWS | 1234...9012 | us-east-1 | non-production | verified");
    expect(line).toMatch(/^[\x20-\x7e]+$/);
  });

  it.each([10, 20, 30, 40, 60, 80, 120])("never exceeds width %i", (width) => {
    const long = snapshot({
      profile: "a-very-long-profile-name-for-testing",
      verification: "expired",
      diagnosticCode: "SSO_EXPIRED",
    });
    expect(bar(long, { width }).length).toBeLessThanOrEqual(width);
    expect(bar(snapshot(), { width }).length).toBeLessThanOrEqual(width);
  });

  it("drops low-priority segments first and keeps the state", () => {
    const line = bar(snapshot(), { width: 40 });
    expect(line).not.toContain("profile");
    expect(line).toContain("verified");
    expect(line).toContain("1234…9012");
  });

  it("has a tone for every state", () => {
    expect(toneOf(interpret(snapshot({ environment: "production" }), fresh))).toBe("alert");
    expect(toneOf(interpret(snapshot(), fresh))).toBe("ok");
    expect(toneOf(interpret(snapshot(), at(STALE_AFTER) + 1))).toBe("warn");
    expect(toneOf(interpret(snapshot({ verification: "expired" }), fresh))).toBe("danger");
    expect(toneOf(interpret(null, fresh))).toBe("muted");
  });

  it("masks short and long ids consistently", () => {
    expect(maskAccount("123456789012")).toBe("1234…9012");
  });
});

describe("path trimming", () => {
  it("trims only the listed separators", () => {
    expect(trimTrailingSeparators("/a/b///")).toBe("/a/b");
    expect(trimTrailingSeparators("/a/b\\")).toBe("/a/b\\");
    expect(trimTrailingSeparators("/a/b\\/", "/\\")).toBe("/a/b");
    expect(trimTrailingSeparators("///")).toBe("");
    expect(trimTrailingSeparators("")).toBe("");
  });

  it("is linear on hostile input", () => {
    const hostile = `${"/".repeat(200_000)}x`;
    const started = performance.now();
    expect(trimTrailingSeparators(hostile)).toBe(hostile);
    expect(normalizeWorkspacePath(`C:\\${"\\".repeat(200_000)}x`).length).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("principalName", () => {
  const arn = (resource: string) =>
    `arn:aws:${resource.startsWith("user") || resource === "root" ? "iam" : "sts"}::123456789012:${resource}`;

  it.each([
    ["user/alice", "alice"],
    ["user/division/team/bob", "bob"],
    ["assumed-role/AWSReservedSSO_Dev_abc/carol@example.com", "carol@example.com"],
    ["assumed-role/Developer/session-1", "session-1"],
    ["assumed-role/OnlyRole", "OnlyRole"],
    ["federated-user/dave", "dave"],
    ["root", "root"],
  ])("reads %s", (resource, expected) => {
    expect(principalName(arn(resource))).toBe(expected);
  });

  it.each([
    null,
    "",
    "not-an-arn",
    "arn:aws:iam::123456789012",
    "arn:aws:iam::123456789012:",
    "arn:aws:iam::123456789012:user",
  ])("returns null for %s", (value) => {
    expect(principalName(value)).toBeNull();
  });

  it("drops control characters and bounds the length", () => {
    expect(principalName(arn("user/a\u0007b"))).toBe("ab");
    const long = principalName(arn(`user/${"x".repeat(100)}`));
    expect(long?.length).toBe(40);
    expect(long?.endsWith("…")).toBe(true);
  });
});

describe("footerLabels", () => {
  const fresh = at("2026-01-01T12:01:00.000Z");
  const labels = (value: Parameters<typeof interpret>[0], now = fresh) =>
    footerLabels(interpret(value, now));
  const sso = "arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_Dev_abc/carol@example.com";

  it("shows user, region and a known environment, and no warning when verified", () => {
    expect(labels(snapshot({ principalArn: sso, environment: "production" }))).toEqual({
      identity: "carol@example.com · us-east-1 · production",
      warning: null,
    });
  });

  it("leaves out whatever is not available", () => {
    expect(labels(snapshot({ principalArn: sso, region: null, environment: "unknown" }))).toEqual({
      identity: "carol@example.com",
      warning: null,
    });
    expect(labels(snapshot({ principalArn: null, environment: "unknown" })).identity).toBe(
      "us-east-1",
    );
  });

  it("never shows the account id", () => {
    const { identity } = labels(snapshot({ principalArn: sso }));
    expect(identity).not.toContain("123456789012");
  });

  it("shows nothing when there is no context", () => {
    expect(labels(null)).toEqual({ identity: null, warning: null });
    const empty = snapshot({
      profile: null,
      accountId: null,
      principalArn: null,
      environment: "unknown",
      verification: "error",
      verifiedAt: null,
      staleAfter: null,
      diagnosticCode: "NO_CREDENTIALS",
    });
    expect(labels(empty)).toEqual({ identity: null, warning: null });
  });

  it.each([
    [{ verification: "expired", diagnosticCode: "SSO_EXPIRED" }, "AWS session expired"],
    [{ verification: "error", diagnosticCode: "OFFLINE" }, "AWS offline"],
    [{ verification: "error", diagnosticCode: "UNKNOWN_ERROR" }, "AWS check failed"],
    [{ verification: "unverified" }, "AWS unverified"],
  ] as const)("warns for %o", (overrides, warning) => {
    expect(labels(snapshot({ ...overrides })).warning).toBe(warning);
  });

  it("warns when an old verification passes its window, keeping the last known identity", () => {
    expect(labels(snapshot(), at(STALE_AFTER) + 1)).toMatchObject({
      identity: expect.stringContaining("us-east-1") as string,
      warning: "AWS check stale",
    });
  });

  it("formats a bounded status line", () => {
    const line = formatFooterLine(interpret(snapshot({ principalArn: sso }), fresh), 20);
    expect(line.length).toBeLessThanOrEqual(20);
    expect(formatFooterLine(interpret(null, fresh))).toBe("");
  });
});
