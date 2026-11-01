import { describe, expect, it } from "vitest";

import {
  DEFAULT_CONFIG,
  MAX_CONFIG_BYTES,
  mergeGuardConfig,
  parseGuardConfig,
} from "../src/lib/config.js";
import { globMatch } from "../src/lib/glob.js";
import { redact, shorten } from "../src/lib/redact.js";

const parse = (value: unknown, source: "user" | "project" = "user") =>
  parseGuardConfig(typeof value === "string" ? value : JSON.stringify(value), source);

describe("guard configuration", () => {
  it("reads rules and settings from the user file", () => {
    const layer = parse({
      version: 1,
      deny: [{ class: "destructive", environment: "production" }, { command: "aws iam delete-*" }],
      ask: [{ class: "write", environment: "non-production" }],
      unattended: "ask",
      onUnverified: "deny",
      mcpServers: { "corp-gateway": "aws" },
    });
    const config = mergeGuardConfig(layer, undefined);
    expect(config.rules).toHaveLength(3);
    expect(config.rules[0]).toEqual({
      action: "deny",
      class: "destructive",
      environment: "production",
    });
    expect(config).toMatchObject({
      unattended: "ask",
      onUnverified: "deny",
      mcpServers: ["corp-gateway"],
      warnings: [],
    });
  });

  it("lets a project file add rules but never loosen anything", () => {
    const project = parse(
      {
        version: 1,
        deny: [{ command: "terraform destroy*" }],
        unattended: "ask",
        onUnverified: "ignore",
        mcpServers: { x: "aws" },
      },
      "project",
    );
    const config = mergeGuardConfig(undefined, project);
    expect(config.rules).toEqual([{ action: "deny", command: "terraform destroy*" }]);
    expect(config.unattended).toBe(DEFAULT_CONFIG.unattended);
    expect(config.onUnverified).toBe("ask");
    expect(config.mcpServers).toEqual([]);
    expect(
      project.warnings.filter((w) => w.includes("only honored in the user file")),
    ).toHaveLength(3);
  });

  it("has no allow rule", () => {
    const layer = parse({ version: 1, allow: [{ class: "write" }] });
    expect(layer.rules).toEqual([]);
    expect(layer.warnings.some((w) => w.includes("unknown top-level key"))).toBe(true);
  });

  it("ignores invalid entries with a warning and keeps the defaults", () => {
    const layer = parse({
      version: 1,
      deny: [{ class: "bogus" }, { environment: "staging" }, { nope: 1 }, "x", {}, { command: "" }],
      unattended: "allow",
      onUnverified: 3,
    });
    const config = mergeGuardConfig(layer, undefined);
    expect(config.rules).toEqual([]);
    expect(config.unattended).toBe("deny");
    expect(config.onUnverified).toBe("ask");
    expect(config.warnings.length).toBeGreaterThanOrEqual(6);
  });

  it.each([["{ not json"], ["[]"], [JSON.stringify({ version: 2 })], ["null"]])(
    "ignores a file that is %s",
    (text) => {
      const layer = parse(text);
      expect(layer.rules).toEqual([]);
      expect(layer.warnings).toHaveLength(1);
    },
  );

  it("ignores an oversized file and caps the rule count", () => {
    expect(parse(" ".repeat(MAX_CONFIG_BYTES + 1)).warnings[0]).toContain("too large");
    const many = Array.from({ length: 150 }, () => ({ class: "write" }));
    const layer = parse({ version: 1, ask: many });
    expect(layer.rules).toHaveLength(100);
    expect(layer.warnings.some((w) => w.includes("first 100"))).toBe(true);
  });

  it("rejects over-long patterns", () => {
    expect(parse({ version: 1, deny: [{ command: "a".repeat(201) }] }).rules).toEqual([]);
  });
});

describe("globMatch", () => {
  it.each([
    ["aws iam delete-*", "aws iam delete-user --user-name u", true],
    ["aws iam delete-*", "aws iam list-users", false],
    ["*", "", true],
    ["a*b*c", "aXbYc", true],
    ["a*b*c", "aXbY", false],
    ["exact", "exact", true],
    ["exact", "exactly", false],
    ["*x", "yyyx", true],
    ["", "", true],
    ["", "a", false],
  ])("%s vs %s", (pattern, text, expected) => {
    expect(globMatch(pattern, text)).toBe(expected);
  });

  it("is not exploitable by pathological patterns", () => {
    const started = performance.now();
    globMatch("*a".repeat(60), "a".repeat(2000));
    globMatch("*a*a*a*a*a*a*a*a*b", "a".repeat(2000));
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("redaction", () => {
  it("removes credentials from environment assignments and flags", () => {
    const text = redact(
      "AWS_SECRET_ACCESS_KEY=abc123 DB_PASSWORD=hunter2 aws x --password hunter2 --token=zzz",
    );
    expect(text).not.toMatch(/abc123|hunter2|zzz/);
    expect(text).toContain("AWS_SECRET_ACCESS_KEY=[redacted]");
  });

  it("removes access key ids and long secret-looking strings", () => {
    const text = redact("echo AKIAIOSFODNN7EXAMPLE wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    expect(text).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(text).not.toContain("wJalrXUtnFEMI");
  });

  it("leaves ordinary commands alone and bounds the length", () => {
    expect(redact("aws s3 ls s3://my-bucket")).toBe("aws s3 ls s3://my-bucket");
    expect(shorten("x".repeat(500)).length).toBe(160);
    expect(shorten("aws   s3\n ls")).toBe("aws s3 ls");
  });
});
