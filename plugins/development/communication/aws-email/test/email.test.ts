import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { rules } from "../src/lib/rules.js";
import { checkDns, checkTemplate, dryRun, judgeRates } from "../src/lib/tools.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-email-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });

describe("rules", () => {
  it("finds identity, configuration set, and receipt problems", () => {
    const p = parseTemplate({
      Resources: {
        Id: { Type: "AWS::SES::EmailIdentity", Properties: { EmailIdentity: "example.com" } },
        Set: { Type: "AWS::SES::ConfigurationSet", Properties: {} },
        Dest: {
          Type: "AWS::SES::ConfigurationSetEventDestination",
          Properties: {
            ConfigurationSetName: { Ref: "Set" },
            EventDestination: { MatchingEventTypes: ["send"] },
          },
        },
        Rule: {
          Type: "AWS::SES::ReceiptRule",
          Properties: { Rule: { Actions: [{ S3Action: { BucketName: "b" } }] } },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const ids = rules("S", p.template).map((f) => f.ruleId);
    for (const id of [
      "EML-NO-DKIM",
      "EML-IDENTITY-NO-CONFIG-SET",
      "EML-NO-BOUNCE-COMPLAINT-EVENTS",
      "EML-NO-REPUTATION-METRICS",
      "EML-RECEIPT-NO-SCAN",
      "EML-RECEIPT-S3-NO-KMS",
    ])
      expect(ids, id).toContain(id);
  });
  it("accepts a configuration set that publishes bounce and complaint events", () => {
    const p = parseTemplate({
      Resources: {
        Set: {
          Type: "AWS::SES::ConfigurationSet",
          Properties: { ReputationOptions: { ReputationMetricsEnabled: true } },
        },
        Dest: {
          Type: "AWS::SES::ConfigurationSetEventDestination",
          Properties: {
            ConfigurationSetName: { Ref: "Set" },
            EventDestination: { MatchingEventTypes: ["bounce", "complaint"] },
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    expect(rules("S", p.template)).toEqual([]);
  });
});

describe("template checks", () => {
  const good = {
    Template: {
      TemplateName: "t",
      SubjectPart: "Hello {{name}}",
      HtmlPart: "<p>Hi {{name}}</p><a href='https://x.example/unsubscribe'>Unsubscribe</a>",
      TextPart: "Hi {{name}} unsubscribe",
    },
  };
  it("accepts a good template and lists its variables", () => {
    const r = checkTemplate(good, { name: "Ana" });
    expect(r.variables).toEqual(["name"]);
    expect(r.issues).toEqual([]);
  });
  it("finds missing parts, unbalanced braces, unclosed sections, missing data, unused data", () => {
    expect(
      checkTemplate({ Template: { HtmlPart: "<p>x</p>" } })
        .issues.map((i) => i.message)
        .join("\n"),
    ).toMatch(/SubjectPart is missing/);
    expect(
      checkTemplate({ SubjectPart: "s" })
        .issues.map((i) => i.message)
        .join("\n"),
    ).toMatch(/needs HtmlPart or TextPart/);
    expect(
      checkTemplate({ SubjectPart: "s", TextPart: "{{a }" })
        .issues.map((i) => i.message)
        .join("\n"),
    ).toMatch(/unbalanced braces/);
    expect(
      checkTemplate({ SubjectPart: "s", TextPart: "{{#items}} x" })
        .issues.map((i) => i.message)
        .join("\n"),
    ).toMatch(/never closed/);
    const d = checkTemplate(good, { other: 1 });
    expect(d.issues.map((i) => i.message).join("\n")).toMatch(/\{\{name\}\} has no value/);
    expect(d.issues.map((i) => i.message).join("\n")).toMatch(/"other" is not used/);
    expect(
      checkTemplate({ SubjectPart: "s", HtmlPart: "<script>x</script> http://a.example" })
        .issues.map((i) => i.message)
        .join("\n"),
    ).toMatch(/script tag[\s\S]*http:\/\//);
    expect(checkTemplate("x").issues).toHaveLength(1);
  });
});

describe("recipients and rates", () => {
  it("separates valid, invalid, duplicate, and simulator addresses", () => {
    const r = dryRun([
      "a@example.com",
      "A@example.com",
      "bad@",
      "success@simulator.amazonses.com",
      "no spaces@x.com",
      "",
    ]);
    expect(r.valid).toEqual(["a@example.com", "success@simulator.amazonses.com"]);
    expect(r.invalid).toEqual(["bad@", "no spaces@x.com"]);
    expect(r.duplicates).toEqual(["A@example.com"]);
    expect(r.simulator).toEqual(["success@simulator.amazonses.com"]);
    expect(r.warnings.join(" ")).toMatch(/sandbox/);
    expect(dryRun(["success@simulator.amazonses.com"]).warnings).toEqual([]);
  });
  it("applies the documented thresholds", () => {
    expect(judgeRates({ sent: 10000, bounces: 400, complaints: 5 }).bounce).toBe("ok");
    expect(judgeRates({ sent: 10000, bounces: 500, complaints: 5 }).bounce).toBe("review");
    expect(judgeRates({ sent: 10000, bounces: 1000, complaints: 5 }).bounce).toBe("pause-risk");
    expect(judgeRates({ sent: 10000, bounces: 0, complaints: 10 }).complaint).toBe("above-target");
    expect(judgeRates({ sent: 10000, bounces: 0, complaints: 9 }).complaint).toBe("ok");
    expect(judgeRates({ sent: 0, bounces: 0, complaints: 0 }).bounceRate).toBe(0);
    expect(judgeRates({ sent: 100, bounces: 1, complaints: 0 }).notes.join(" ")).toMatch(
      /Fewer than 1,000/,
    );
  });
  it("checks DNS record syntax", () => {
    expect(
      checkDns({
        spf: "v=spf1 include:amazonses.com ~all",
        dmarc: "v=DMARC1; p=reject; rua=mailto:d@example.com",
        dkimCnames: [
          "a._domainkey.example.com CNAME a.dkim.amazonses.com",
          "b._domainkey.example.com CNAME b.dkim.amazonses.com",
          "c._domainkey.example.com CNAME c.dkim.amazonses.com",
        ],
      }),
    ).toEqual({ spf: [], dkim: [], dmarc: [] });
    const bad = checkDns({ spf: "spf1 +all", dmarc: "v=DMARC1; p=none", dkimCnames: ["x"] });
    expect(bad.spf.join(" ")).toMatch(/must start with v=spf1/);
    expect(bad.dmarc.join(" ")).toMatch(/only monitors[\s\S]*No rua/);
    expect(bad.dkim.join(" ")).toMatch(/three CNAME/);
  });
});

describe("the command line", () => {
  it("runs each command and sends nothing", async () => {
    writeFileSync(
      join(root, "t.json"),
      JSON.stringify({
        Template: { SubjectPart: "Hi {{name}}", TextPart: "Hi {{name}} unsubscribe" },
      }),
    );
    writeFileSync(join(root, "d.json"), JSON.stringify({ name: "x" }));
    expect((await cli(["template-check", "t.json", "--data", "d.json"])).stdout).toMatch(
      /Variables: name/,
    );
    writeFileSync(join(root, "bad.json"), JSON.stringify({ SubjectPart: "{{x" }));
    expect((await cli(["template-check", "bad.json"])).exitCode).toBe(1);
    expect((await cli(["dry-run", "--to", "a@example.com,b@example.com"])).stdout).toMatch(
      /NOT SENT. 2 valid/,
    );
    expect((await cli(["dry-run", "--to", "nope"])).exitCode).toBe(1);
    expect((await cli(["dry-run"])).exitCode).toBe(2);
    expect(
      (await cli(["deliverability", "--sent", "1000", "--bounces", "60", "--complaints", "0"]))
        .stdout,
    ).toMatch(/\(review\)/);
    expect((await cli(["deliverability", "--dmarc", "v=DMARC1; p=none"])).stdout).toMatch(
      /DMARC: p=none only monitors/,
    );
    expect((await cli(["deliverability"])).exitCode).toBe(2);
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({ Resources: { C: { Type: "AWS::SES::ConfigurationSet", Properties: {} } } }),
    );
    expect((await cli(["inspect"])).stdout).toContain("EML-NO-BOUNCE-COMPLAINT-EVENTS");
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});
