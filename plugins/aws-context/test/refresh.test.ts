import { describe, expect, it } from "vitest";

import { classifyError } from "../src/lib/diagnostics.js";
import { refreshContext } from "../src/lib/refresh.js";
import { ACCOUNT, ARN, configOf, deps, envOf, failure, NOW, OTHER_ACCOUNT } from "./helpers.js";

describe("refreshContext: success", () => {
  it("records a verified identity with a staleness window from the configured TTL", async () => {
    const snapshot = await refreshContext(deps({ config: configOf({ ttlMinutes: 10 }) }));
    expect(snapshot).toMatchObject({
      verification: "verified",
      accountId: ACCOUNT,
      principalArn: ARN,
      region: "us-east-1",
      profile: "dev",
      verifiedAt: "2026-01-01T12:00:00.000Z",
      staleAfter: "2026-01-01T12:10:00.000Z",
      diagnosticCode: null,
      environment: "unknown",
    });
    expect(snapshot.workspaceId).toMatch(/^[0-9a-f]{16}$/);
  });

  it("classifies the environment from the verified account, never from the profile name", async () => {
    const config = configOf({ accounts: { [ACCOUNT]: { environment: "production" } } });
    const viaProfileNamedDev = await refreshContext(deps({ config }));
    expect(viaProfileNamedDev.environment).toBe("production");
    const viaProfileNamedProd = await refreshContext(
      deps({ config: configOf(), env: envOf({ AWS_PROFILE: "prod" }) }),
    );
    expect(viaProfileNamedProd.environment).toBe("unknown");
  });

  it("reports the account STS returns even when the profile claims another one", async () => {
    const config = configOf({ accounts: { [OTHER_ACCOUNT]: { environment: "non-production" } } });
    const snapshot = await refreshContext(deps({ config }));
    expect(snapshot.accountId).toBe(ACCOUNT);
    expect(snapshot.environment).toBe("unknown");
  });

  it("uses a global endpoint but reports an unknown region", async () => {
    let endpointRegion = "";
    const snapshot = await refreshContext(
      deps({
        resolveSdkRegion: () => Promise.resolve(null),
        verify: (input) => {
          endpointRegion = input.region;
          return Promise.resolve({ accountId: ACCOUNT, arn: ARN });
        },
      }),
    );
    expect(endpointRegion).toBe("us-east-1");
    expect(snapshot.region).toBeNull();
    expect(snapshot.verification).toBe("verified");
    expect(snapshot.diagnosticCode).toBe("REGION_UNRESOLVED");
  });

  it("honors AWS_DEFAULT_REGION when the SDK finds none, and ignores a malformed one", async () => {
    const fallback = (value: string) =>
      refreshContext(
        deps({
          resolveSdkRegion: () => Promise.resolve(null),
          env: envOf({ AWS_DEFAULT_REGION: value }),
        }),
      );
    expect((await fallback("eu-west-2")).region).toBe("eu-west-2");
    expect((await fallback("not a region")).region).toBeNull();
  });

  it("rejects a malformed STS response instead of recording it", async () => {
    const snapshot = await refreshContext(
      deps({ verify: () => Promise.resolve({ accountId: "abc", arn: "nope" }) }),
    );
    expect(snapshot).toMatchObject({
      verification: "error",
      diagnosticCode: "UNKNOWN_ERROR",
      accountId: null,
    });
  });

  it("drops a hostile or oversized AWS_PROFILE", async () => {
    for (const value of ["x".repeat(200), "bad\u0007name", "   "]) {
      const snapshot = await refreshContext(deps({ env: envOf({ AWS_PROFILE: value }) }));
      expect(snapshot.profile).toBeNull();
    }
  });
});

describe("refreshContext: failures", () => {
  const failing = (error: Error) => ({ verify: () => Promise.reject(error) });

  it.each([
    ["expired token", failure("ExpiredToken"), "expired", "CREDENTIALS_EXPIRED"],
    ["invalid token", failure("InvalidClientTokenId"), "error", "CREDENTIALS_INVALID"],
    ["access denied", failure("AccessDenied"), "error", "ACCESS_DENIED"],
    ["timeout", failure("TimeoutError"), "error", "TIMEOUT"],
    ["dns failure", failure("Error", "boom", "ENOTFOUND"), "error", "OFFLINE"],
    [
      "no credentials",
      failure("CredentialsProviderError", "Could not load credentials"),
      "unverified",
      "NO_CREDENTIALS",
    ],
    [
      "expired sso",
      failure("CredentialsProviderError", "The SSO session has expired"),
      "expired",
      "SSO_EXPIRED",
    ],
    ["unknown", failure("Weird"), "error", "UNKNOWN_ERROR"],
  ] as const)("maps %s to a closed code", async (_name, error, verification, code) => {
    const snapshot = await refreshContext(deps(failing(error)));
    expect(snapshot).toMatchObject({ verification, diagnosticCode: code });
  });

  it("never stores error text", async () => {
    const secret = "AKIAIOSFODNN7EXAMPLE";
    const snapshot = await refreshContext(
      deps(failing(failure("Weird", `request for ${secret} failed`))),
    );
    expect(JSON.stringify(snapshot)).not.toContain(secret);
    expect(JSON.stringify(snapshot)).not.toContain("request for");
  });

  it("starts empty when there is nothing to carry over", async () => {
    const snapshot = await refreshContext(deps(failing(failure("CredentialsProviderError"))));
    expect(snapshot).toMatchObject({
      accountId: null,
      principalArn: null,
      verifiedAt: null,
      environment: "unknown",
    });
  });

  describe("last known identity", () => {
    it("is kept, flagged non-current, for the same workspace and profile", async () => {
      const good = await refreshContext(
        deps({ config: configOf({ accounts: { [ACCOUNT]: { environment: "production" } } }) }),
      );
      const later = new Date(NOW.getTime() + 3_600_000);
      const bad = await refreshContext(
        deps({
          prior: good,
          now: later,
          config: configOf({ accounts: { [ACCOUNT]: { environment: "production" } } }),
          ...failing(failure("Error", "x", "ECONNREFUSED")),
        }),
      );
      expect(bad).toMatchObject({
        verification: "error",
        diagnosticCode: "OFFLINE",
        accountId: ACCOUNT,
        environment: "production",
        verifiedAt: good.verifiedAt,
      });
    });

    it("is dropped without a named profile, because the credentials may be another account's", async () => {
      const good = await refreshContext(deps({ env: envOf({}) }));
      const bad = await refreshContext(
        deps({ prior: good, env: envOf({}), ...failing(failure("ExpiredToken")) }),
      );
      expect(good.accountId).toBe(ACCOUNT);
      expect(bad.accountId).toBeNull();
      expect(bad.principalArn).toBeNull();
    });

    it("is dropped when the profile changed", async () => {
      const good = await refreshContext(deps());
      const bad = await refreshContext(
        deps({
          prior: good,
          env: envOf({ AWS_PROFILE: "other" }),
          ...failing(failure("ExpiredToken")),
        }),
      );
      expect(bad.accountId).toBeNull();
    });

    it("is dropped for a different workspace", async () => {
      const good = await refreshContext(deps());
      const bad = await refreshContext(
        deps({ prior: good, projectDir: "/work/other", ...failing(failure("ExpiredToken")) }),
      );
      expect(bad.accountId).toBeNull();
    });
  });
});

describe("classifyError", () => {
  it("reads the nested cause code", () => {
    const error = Object.assign(new Error("x"), { cause: { code: "ECONNRESET" } });
    expect(classifyError(error).code).toBe("OFFLINE");
  });

  it("handles non-error values", () => {
    expect(classifyError("string").code).toBe("UNKNOWN_ERROR");
    expect(classifyError(null).code).toBe("UNKNOWN_ERROR");
  });
});
