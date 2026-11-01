import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { rules } from "../src/lib/rules.js";
import { checkClaims, looksLikeToken } from "../src/lib/tokens.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-auth-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const NOW = new Date("2026-10-31T12:00:00Z");
const cli = (a: string[]) => runCli(a, { root, now: NOW });
const ISS = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_abc";
const t = Math.floor(NOW.getTime() / 1000);

describe("rules", () => {
  it("finds weak pool and client settings", () => {
    const p = parseTemplate({
      Resources: {
        Pool: {
          Type: "AWS::Cognito::UserPool",
          Properties: { Policies: { PasswordPolicy: { MinimumLength: 6 } } },
        },
        App: {
          Type: "AWS::Cognito::UserPoolClient",
          Properties: {
            AllowedOAuthFlows: ["implicit", "code"],
            CallbackURLs: [
              "https://*.example.com/cb",
              "http://example.com/cb",
              "http://localhost:3000/cb",
            ],
            ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
            AllowedOAuthScopes: ["aws.cognito.signin.user.admin"],
            GenerateSecret: true,
            AllowedOAuthFlowsUserPoolClient: true,
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const ids = rules("S", p.template).map((f) => f.ruleId);
    for (const id of [
      "AUTH-NO-MFA",
      "AUTH-WEAK-PASSWORD",
      "AUTH-NO-DELETION-PROTECTION",
      "AUTH-SELF-SIGNUP",
      "AUTH-IMPLICIT-GRANT",
      "AUTH-WILDCARD-CALLBACK",
      "AUTH-HTTP-CALLBACK",
      "AUTH-LOCALHOST-CALLBACK",
      "AUTH-USER-PASSWORD-FLOW",
      "AUTH-USER-ENUMERATION",
      "AUTH-BROAD-SCOPE",
      "AUTH-SECRET-CHECK",
      "AUTH-NO-REFRESH-ROTATION",
    ])
      expect(ids, id).toContain(id);
    expect(ids.filter((i) => i === "AUTH-HTTP-CALLBACK")).toHaveLength(1);
  });
  it("passes a careful client", () => {
    const p = parseTemplate({
      Resources: {
        Pool: {
          Type: "AWS::Cognito::UserPool",
          Properties: {
            MfaConfiguration: "ON",
            DeletionProtection: "ACTIVE",
            AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
            Policies: { PasswordPolicy: { MinimumLength: 14 } },
          },
        },
        App: {
          Type: "AWS::Cognito::UserPoolClient",
          Properties: {
            AllowedOAuthFlows: ["code"],
            CallbackURLs: ["https://app.example.com/cb"],
            PreventUserExistenceErrors: "ENABLED",
            RefreshTokenRotation: { Feature: "ENABLED" },
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    expect(rules("S", p.template)).toEqual([]);
  });
});

describe("claims", () => {
  const good = {
    iss: ISS,
    exp: t + 600,
    iat: t - 10,
    token_use: "access",
    client_id: "app1",
    scope: "orders/read openid",
    "cognito:groups": ["staff"],
  };
  const e = { issuer: ISS, audience: "app1", use: "access" as const, now: NOW };
  it("accepts good claims", () => {
    expect(checkClaims(good, { ...e, scope: "orders/read", group: "staff" }).ok).toBe(true);
  });
  it("rejects wrong issuer, expired, not-yet-valid, wrong use, wrong audience, missing scope or group", () => {
    const run = (claims: object, extra = {}) =>
      checkClaims(claims, { ...e, ...extra }).problems.join("\n");
    expect(run({ ...good, iss: "https://evil.example" })).toMatch(/iss is/);
    expect(run({ ...good, exp: t - 3600 })).toMatch(/expired 3600 seconds ago/);
    expect(run({ ...good, exp: undefined })).toMatch(/exp is missing/);
    expect(run({ ...good, nbf: t + 3600 })).toMatch(/not valid yet/);
    expect(run({ ...good, token_use: "id" })).toMatch(/expects an access token/);
    expect(run({ ...good, client_id: "other" })).toMatch(/client_id is "other"/);
    expect(run(good, { scope: "admin" })).toMatch(/scope "admin" is missing/);
    expect(run(good, { group: "admins" })).toMatch(/not in group/);
    expect(checkClaims("x", e).ok).toBe(false);
  });
  it("allows a small clock skew, and uses aud for id tokens", () => {
    expect(checkClaims({ ...good, exp: t - 30 }, e).ok).toBe(true);
    expect(
      checkClaims(
        { iss: ISS, exp: t + 60, token_use: "id", aud: "app1" },
        { issuer: ISS, audience: "app1", use: "id", now: NOW },
      ).ok,
    ).toBe(true);
  });
  it("says so when no audience was checked", () => {
    expect(checkClaims(good, { issuer: ISS, now: NOW }).notes.join(" ")).toMatch(/No audience/);
  });
  it("recognizes tokens", () => {
    expect(looksLikeToken("eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturepart")).toBe(
      true,
    );
    expect(looksLikeToken('{"sub":"x"}')).toBe(false);
  });
});

describe("the command line", () => {
  it("checks claims, refuses real tokens without echoing them, and recommends flows", async () => {
    writeFileSync(
      join(root, "c.json"),
      JSON.stringify({ iss: ISS, exp: t + 600, token_use: "access", client_id: "app1" }),
    );
    expect(
      (
        await cli([
          "claims-check",
          "c.json",
          "--issuer",
          ISS,
          "--audience",
          "app1",
          "--use",
          "access",
        ])
      ).stdout,
    ).toMatch(/meet the expectations/);
    expect(
      (await cli(["claims-check", "c.json", "--issuer", "https://other", "--audience", "app1"]))
        .exitCode,
    ).toBe(1);
    const token = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlcGFydA";
    writeFileSync(join(root, "tok.txt"), token);
    const r = await cli(["claims-check", "tok.txt", "--issuer", ISS]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/looks like a JWT/);
    expect(r.stdout).not.toContain(token);
    expect((await cli(["claims-check", "c.json"])).exitCode).toBe(2);
    expect((await cli(["flows", "spa"])).stdout).toMatch(/PKCE/);
    expect((await cli(["flows", "constructor"])).exitCode).toBe(2);
    expect((await cli(["flows"])).stdout).toMatch(/Token verification checklist/);
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({ Resources: { P: { Type: "AWS::Cognito::UserPool", Properties: {} } } }),
    );
    expect((await cli(["inspect"])).stdout).toContain("AUTH-NO-MFA");
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});
