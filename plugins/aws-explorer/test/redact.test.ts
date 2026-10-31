import { describe, expect, it } from "vitest";

import { createRedactor, isSecretName, REDACTED, sanitizeText } from "../src/lib/redact.js";

describe("isSecretName", () => {
  it.each([
    "Password",
    "DB_PASSWORD",
    "MasterUserPassword",
    "apiKey",
    "AuthToken",
    "ClientSecret",
    "PrivateKey",
    "ConnectionString",
    "SessionToken",
    "accessKey",
  ])("treats %s as secret", (name) => {
    expect(isSecretName(name)).toBe(true);
  });
  it.each([
    "SecretArn",
    "SecretsManagerSecretId",
    "KmsKeyId",
    "TokenValidityUnits",
    "FunctionName",
    "PasswordPolicy",
    "AccessKeyId",
    "BucketName",
  ])("does not treat %s as secret", (name) => {
    expect(isSecretName(name)).toBe(false);
  });
});

describe("createRedactor", () => {
  it("redacts values of secret-named properties and counts them", () => {
    const redactor = createRedactor();
    const result = redactor.value({
      MasterUserPassword: "hunter2",
      Engine: "postgres",
      Nested: { ApiKey: "k" },
    }) as Record<string, unknown>;
    expect(result["MasterUserPassword"]).toBe(REDACTED);
    expect(result["Engine"]).toBe("postgres");
    expect((result["Nested"] as Record<string, unknown>)["ApiKey"]).toBe(REDACTED);
    expect(redactor.count()).toBe(2);
  });

  it("keeps names but never values of Lambda environment variables", () => {
    const redactor = createRedactor();
    const result = redactor.value({
      Environment: { Variables: { TABLE: "orders", STAGE: "prod" } },
    }) as {
      Environment: { Variables: Record<string, string> };
    };
    expect(result.Environment.Variables).toEqual({ TABLE: REDACTED, STAGE: REDACTED });
    expect(redactor.count()).toBe(2);
  });

  it("redacts ECS and CodeBuild environment lists", () => {
    const redactor = createRedactor();
    const result = redactor.value({
      Environment: [{ Name: "A", Value: "1" }],
      EnvironmentVariables: [{ Name: "B", Value: "2", Type: "PLAINTEXT" }],
    }) as Record<string, Array<Record<string, string>>>;
    expect(result["Environment"]?.[0]).toEqual({ Name: "A", Value: REDACTED });
    expect(result["EnvironmentVariables"]?.[0]).toEqual({
      Name: "B",
      Value: REDACTED,
      Type: "PLAINTEXT",
    });
  });

  it("uses the name of key/value entries, as in tags, parameters, and outputs", () => {
    const redactor = createRedactor();
    const result = redactor.value([
      { Key: "Owner", Value: "team" },
      { Key: "db-password", Value: "x" },
      { ParameterKey: "AdminPassword", ParameterValue: "y" },
      { OutputKey: "Url", OutputValue: "https://x" },
    ]) as Array<Record<string, string>>;
    expect(result.map((entry) => Object.values(entry).at(-1))).toEqual([
      "team",
      REDACTED,
      REDACTED,
      "https://x",
    ]);
  });

  it("redacts credential-shaped values wherever they appear", () => {
    const redactor = createRedactor();
    const result = redactor.value({
      Note: "use AKIAIOSFODNN7EXAMPLE here",
      Pem: "-----BEGIN RSA PRIVATE KEY-----\nabc",
      Jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r",
      Fine: "hello",
    }) as Record<string, string>;
    expect(Object.values(result)).toEqual([REDACTED, REDACTED, REDACTED, "hello"]);
  });

  it("removes terminal escapes and control characters, keeping text", () => {
    expect(sanitizeText("\u001b[31mred\u001b[0m\u0007 ok‮")).toBe("red ok");
    const redactor = createRedactor();
    expect(redactor.field("Description", "a\u001b[2Jb")).toBe("ab");
  });

  it("bounds depth, array length, and string length, and says it cut", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 40; i += 1) {
      const next: Record<string, unknown> = {};
      cursor["n"] = next;
      cursor = next;
    }
    const redactor = createRedactor();
    redactor.value(deep);
    expect(redactor.cut()).toBe(true);
    const arrays = createRedactor();
    expect((arrays.value(Array.from({ length: 500 }, (_, i) => i)) as unknown[]).length).toBe(200);
    expect(arrays.cut()).toBe(true);
    const long = createRedactor();
    expect(String(long.value("x".repeat(5000))).length).toBeLessThan(2100);
    expect(long.cut()).toBe(true);
  });

  it("leaves ordinary data alone", () => {
    const redactor = createRedactor();
    const data = {
      FunctionName: "f",
      Runtime: "nodejs22.x",
      MemorySize: 128,
      Enabled: true,
      Tags: [{ Key: "a", Value: "b" }],
      None: null,
    };
    expect(redactor.value(data)).toEqual(data);
    expect(redactor.count()).toBe(0);
  });
});
