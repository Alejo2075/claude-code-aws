import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { remediation, threatModel } from "../src/lib/threat.js";
import { deps, inline, template, TEMPLATES } from "./helpers.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-sec-tm-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const seed = (name: string): void => {
  mkdirSync(join(root, "cdk.out"), { recursive: true });
  writeFileSync(
    join(root, "cdk.out", "S.template.json"),
    readFileSync(join(TEMPLATES, `${name}.template.json`)),
  );
};

describe("threat model", () => {
  it("finds the open entry point and the stores it can reach, as hypotheses", () => {
    const m = threatModel([{ name: "S", template: template("auth-api.missing-auth") }]);
    expect(m.entryPoints.some((e) => e.unauthenticatedRoutes > 0)).toBe(true);
    const open = m.findings.find((f) => f.ruleId === "SEC-TM-OPEN-ENTRY");
    expect(open?.status).toBe("hypothesis");
    expect(open?.explanation).toMatch(/Whether this is intended depends/);
    expect(m.boundaries).toContain("internet");
    for (const f of m.findings) expect(f.status).toBe("hypothesis");
  });
  it("reports only the one public route when the others have an authorizer, and says it may be intended", () => {
    const m = threatModel([{ name: "S", template: template("auth-api.v1") }]);
    const open = m.findings.filter((f) => f.ruleId === "SEC-TM-OPEN-ENTRY");
    expect(open).toHaveLength(1);
    expect(open[0]?.title).toMatch(/1 route\(s\) callable without authorization/);
    expect(open[0]?.explanation).toMatch(/a public health check is not a threat/);
    const none = threatModel([
      {
        name: "S",
        template: inline({
          Api: { Type: "AWS::ApiGatewayV2::Api", Properties: { ProtocolType: "HTTP" } },
          R: {
            Type: "AWS::ApiGatewayV2::Route",
            Properties: { ApiId: { Ref: "Api" }, RouteKey: "GET /x", AuthorizationType: "JWT" },
          },
        }),
      },
    ]);
    expect(none.findings.filter((f) => f.ruleId === "SEC-TM-OPEN-ENTRY")).toEqual([]);
  });
  it("describes inferred links as possible, not as observed", () => {
    const m = threatModel([{ name: "S", template: template("auth-api.missing-auth") }]);
    const blast = m.findings.filter((f) => f.ruleId === "SEC-TM-BLAST-RADIUS");
    for (const f of blast)
      expect(f.explanation).toMatch(/inferred.*possible, not what the code does/);
  });
});

describe("remediation", () => {
  it("proposes a change and a check for known rules, and falls back for unknown ones", () => {
    expect(remediation("SEC-S3-SSL-NOT-ENFORCED", undefined).change).toMatch(/enforceSSL/);
    expect(remediation("SEC-UNKNOWN", "Do the thing").change).toBe("Do the thing");
    expect(remediation("SEC-UNKNOWN", undefined).change).toMatch(/no specific change/);
  });
});

describe("the commands", () => {
  it("threat-model prints entry points, paths, and the STRIDE caveat", async () => {
    seed("auth-api.missing-auth");
    const r = await runCli(["threat-model"], deps(root));
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/Trust boundaries: internet/);
    expect(r.stdout).toMatch(/Entry points:/);
    expect(r.stdout).toMatch(/STRIDE here is a prompt for questions/);
  });
  it("remediate lists proposals and says nothing was changed", async () => {
    seed("flawed.v1");
    const r = await runCli(["remediate"], deps(root));
    expect(r.stdout).toMatch(/NOTHING WAS CHANGED/);
    expect(r.stdout).toMatch(/Change:/);
    expect(r.stdout).toMatch(/Verify:/);
    const before = readFileSync(join(root, "cdk.out", "S.template.json"), "utf8");
    await runCli(["remediate"], deps(root));
    expect(readFileSync(join(root, "cdk.out", "S.template.json"), "utf8")).toBe(before);
  });
});
