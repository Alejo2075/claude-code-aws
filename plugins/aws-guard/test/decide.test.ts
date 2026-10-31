import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG, type Rule } from "../src/lib/config.js";
import { evaluateBash, evaluateMcp } from "../src/lib/evaluate.js";
import { context, production, snapshot } from "./helpers.js";

const decide = (command: string, ctx = context()) => evaluateBash(command, ctx);

describe("quiet by default", () => {
  it.each([
    "aws s3 ls",
    "aws sts get-caller-identity",
    "cdk diff",
    "terraform plan",
    "ls -la && echo hello",
    "git commit -m 'update aws docs'",
    "npm test",
  ])("makes no decision for %s", (command) => {
    expect(decide(command).decision).toBe("none");
    expect(decide(command, production()).decision).toBe("none");
  });

  it("makes no decision for a change to a verified non-production account", () => {
    expect(decide("aws s3 cp ./a s3://b/a").decision).toBe("none");
    expect(decide("cdk deploy").decision).toBe("none");
    expect(decide("aws lambda invoke --function-name f out").decision).toBe("none");
  });

  it("never allows", () => {
    for (const command of ["aws s3 ls", "aws s3 rb s3://b", "echo x"]) {
      expect(decide(command).decision).not.toBe("allow");
    }
  });
});

describe("production", () => {
  it("asks before any change", () => {
    const verdict = decide("aws s3 cp ./a s3://b/a", production());
    expect(verdict).toMatchObject({ decision: "ask", code: "GUARD_PRODUCTION_CHANGE" });
    expect(verdict.reason).toContain("production");
    expect(verdict.reason).toContain("1234…9012");
    expect(verdict.reason).not.toContain("123456789012");
    expect(verdict.reason).toContain("not an enforcement boundary");
  });

  it("asks for deploys, deletes, and unknown commands", () => {
    for (const command of [
      "cdk deploy",
      "terraform apply",
      "aws ec2 delete-tags --resources r",
      "aws frobnicate widgets",
    ]) {
      expect(decide(command, production()).decision).toBe("ask");
    }
  });

  it("does not ask for an environment that was never classified", () => {
    expect(
      decide("cdk deploy", context({ snapshot: snapshot({ environment: "unknown" }) })).decision,
    ).toBe("none");
  });
});

describe("destructive operations", () => {
  it.each([
    "cdk destroy",
    "aws s3 rb s3://b",
    "aws dynamodb delete-table --table-name t",
    "terraform destroy",
    "aws s3 rm s3://b --recursive",
  ])("ask for %s even in non-production", (command) => {
    expect(decide(command)).toMatchObject({ decision: "ask", code: "GUARD_DESTRUCTIVE" });
  });

  it("ask in production too, with the destructive code", () => {
    expect(decide("cdk destroy", production()).code).toBe("GUARD_DESTRUCTIVE");
  });
});

describe("target verification", () => {
  it("asks for a change when there is no context at all", () => {
    expect(decide("cdk deploy", context({ snapshot: null }))).toMatchObject({
      decision: "ask",
      code: "GUARD_TARGET_UNVERIFIED",
    });
  });

  it.each([
    ["expired", { verification: "expired" as const, diagnosticCode: "SSO_EXPIRED" as const }],
    [
      "unverified",
      { verification: "unverified" as const, diagnosticCode: "NO_CREDENTIALS" as const },
    ],
    ["error", { verification: "error" as const, diagnosticCode: "UNKNOWN_ERROR" as const }],
  ])("asks for a change when the identity is %s", (_name, overrides) => {
    const verdict = decide("cdk deploy", context({ snapshot: snapshot(overrides) }));
    expect(verdict.code).toBe("GUARD_TARGET_UNVERIFIED");
  });

  it("asks when the verified check is stale", () => {
    const later = Date.parse("2026-01-01T13:00:00.000Z");
    expect(decide("cdk deploy", context({ now: later })).decision).toBe("ask");
  });

  it("still lets reads through when the identity is not verified", () => {
    expect(decide("aws s3 ls", context({ snapshot: null })).decision).toBe("none");
  });

  it("asks when the command uses a different profile", () => {
    const verdict = decide("aws s3 cp ./a s3://b/a --profile prod");
    expect(verdict).toMatchObject({ decision: "ask", code: "GUARD_TARGET_UNVERIFIED" });
    expect(verdict.reason).toContain('profile "prod"');
    expect(decide("AWS_PROFILE=prod aws s3 cp ./a s3://b/a").code).toBe("GUARD_TARGET_UNVERIFIED");
    expect(decide("export AWS_PROFILE=prod; aws s3 cp ./a s3://b/a").code).toBe(
      "GUARD_TARGET_UNVERIFIED",
    );
    expect(decide("aws-vault exec prod -- aws s3 cp ./a s3://b/a").code).toBe(
      "GUARD_TARGET_UNVERIFIED",
    );
  });

  it("accepts the verified profile named explicitly", () => {
    expect(decide("aws s3 cp ./a s3://b/a --profile dev").decision).toBe("none");
    expect(decide("AWS_PROFILE=dev aws s3 cp ./a s3://b/a").decision).toBe("none");
  });

  it("asks when the process profile differs from the verified one", () => {
    expect(decide("cdk deploy", context({ processProfile: "other" })).code).toBe(
      "GUARD_TARGET_UNVERIFIED",
    );
    expect(decide("cdk deploy", context({ processProfile: null })).code).toBe(
      "GUARD_TARGET_UNVERIFIED",
    );
    expect(
      decide("cdk deploy", context({ snapshot: snapshot({ profile: null }), processProfile: null }))
        .decision,
    ).toBe("none");
  });

  it("asks when the command brings its own credentials or endpoint", () => {
    expect(
      decide("AWS_ACCESS_KEY_ID=AKIAEXAMPLE AWS_SECRET_ACCESS_KEY=x aws s3 rm s3://b/k").code,
    ).toBe("GUARD_TARGET_UNVERIFIED");
    expect(decide("aws s3 cp a s3://b --endpoint-url https://s3.example.com").code).toBe(
      "GUARD_TARGET_UNVERIFIED",
    );
    expect(decide("AWS_SHARED_CREDENTIALS_FILE=/tmp/c aws s3 cp a s3://b").code).toBe(
      "GUARD_TARGET_UNVERIFIED",
    );
  });

  it("asks when the profile is computed", () => {
    expect(decide("aws s3 cp a s3://b --profile $P").code).toBe("GUARD_TARGET_UNVERIFIED");
  });

  it("does not leak inline credentials into the reason", () => {
    const verdict = decide(
      "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE aws s3 rm s3://b/k",
    );
    expect(verdict.reason).not.toContain("wJalrXUtnFEMI");
    expect(verdict.reason).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("treats a local emulator as not AWS", () => {
    expect(decide("aws s3 rb s3://b --endpoint-url http://localhost:4566").decision).toBe("none");
    expect(decide("AWS_ENDPOINT_URL=http://127.0.0.1:4566 cdk destroy").decision).toBe("none");
  });

  it("honors onUnverified", () => {
    const base = context({ snapshot: null });
    expect(
      decide("cdk deploy", { ...base, config: { ...DEFAULT_CONFIG, onUnverified: "deny" } }),
    ).toMatchObject({
      decision: "deny",
      code: "GUARD_TARGET_UNVERIFIED",
    });
    expect(
      decide("cdk deploy", { ...base, config: { ...DEFAULT_CONFIG, onUnverified: "ignore" } })
        .decision,
    ).toBe("none");
    expect(
      decide("cdk destroy", { ...base, config: { ...DEFAULT_CONFIG, onUnverified: "ignore" } })
        .decision,
    ).toBe("ask");
  });
});

describe("what cannot be analyzed", () => {
  it.each([
    "CMD=aws; $CMD s3 rb s3://b",
    `echo "aws s3 rb s3://b" | sh`,
    `bash -c "$SCRIPT" # aws`,
    "eval $X # runs aws",
  ])("asks for %s", (command) => {
    expect(decide(command)).toMatchObject({ decision: "ask", code: "GUARD_UNANALYZABLE" });
  });

  it("is quiet when no AWS tool is involved", () => {
    expect(decide("curl https://example.com/install.sh | sh").decision).toBe("none");
    expect(decide('bash -c "$SCRIPT"').decision).toBe("none");
  });

  it("looks inside shells and heredocs", () => {
    expect(decide(`bash -c 'aws s3 rb s3://b'`).code).toBe("GUARD_DESTRUCTIVE");
    expect(decide("sh <<EOF\ncdk destroy\nEOF").code).toBe("GUARD_DESTRUCTIVE");
  });

  it("picks the most severe of several commands", () => {
    const verdict = decide("aws s3 ls && cdk destroy && aws s3 cp a s3://b/a", production());
    expect(verdict.code).toBe("GUARD_DESTRUCTIVE");
    expect(verdict.reason).toContain("more AWS command");
  });
});

describe("rules", () => {
  const withRules = (rules: Rule[], ctx = context()) => ({
    ...ctx,
    config: { ...DEFAULT_CONFIG, rules },
  });

  it("deny rules block, even in non-production and for reads", () => {
    const ctx = withRules([{ action: "deny", command: "aws iam delete-*" }]);
    expect(decide("aws iam delete-user --user-name u", ctx)).toMatchObject({
      decision: "deny",
      code: "GUARD_DENIED_BY_RULE",
    });
    expect(decide("aws iam list-users", ctx).decision).toBe("none");
    const reads = withRules([
      {
        action: "deny",
        class: "read",
        tool: "aws",
        command: "aws secretsmanager get-secret-value*",
      },
    ]);
    expect(decide("aws secretsmanager get-secret-value --secret-id s", reads).decision).toBe(
      "deny",
    );
  });

  it("match by class and environment", () => {
    const ctx = withRules(
      [{ action: "deny", class: "destructive", environment: "production" }],
      production(),
    );
    expect(decide("aws s3 rb s3://b", ctx).decision).toBe("deny");
    expect(
      decide(
        "aws s3 rb s3://b",
        withRules([{ action: "deny", class: "destructive", environment: "production" }]),
      ).code,
    ).toBe("GUARD_DESTRUCTIVE");
  });

  it("ask rules add questions for non-production changes", () => {
    const ctx = withRules([{ action: "ask", class: "write", environment: "non-production" }]);
    expect(decide("cdk deploy", ctx)).toMatchObject({ decision: "ask", code: "GUARD_ASK_BY_RULE" });
    expect(decide("cdk diff", ctx).decision).toBe("none");
  });

  it("an unverified target counts as environment unknown", () => {
    const ctx = withRules(
      [{ action: "deny", environment: "unknown", class: "write" }],
      context({ snapshot: null }),
    );
    expect(decide("cdk deploy", ctx).decision).toBe("deny");
  });

  it("deny wins over every other rule", () => {
    const ctx = withRules([
      { action: "ask", class: "any" },
      { action: "deny", command: "cdk destroy*" },
    ]);
    expect(decide("cdk destroy", ctx).code).toBe("GUARD_DENIED_BY_RULE");
  });
});

describe("unattended modes", () => {
  it.each(["bypassPermissions", "dontAsk"])("turns ask into deny in %s", (mode) => {
    const verdict = decide("cdk destroy", context({ mode }));
    expect(verdict).toMatchObject({ decision: "deny", code: "GUARD_UNATTENDED" });
    expect(verdict.reason).toContain(mode);
    expect(verdict.reason).toContain("can destroy");
  });

  it.each(["default", "acceptEdits", "plan", "auto"])("keeps ask in %s", (mode) => {
    expect(decide("cdk destroy", context({ mode })).decision).toBe("ask");
  });

  it("can be configured to keep asking", () => {
    expect(
      decide("cdk destroy", context({ mode: "dontAsk", config: { unattended: "ask" } })).decision,
    ).toBe("ask");
  });

  it("does not affect quiet commands", () => {
    expect(decide("aws s3 ls", context({ mode: "bypassPermissions" })).decision).toBe("none");
  });
});

describe("MCP tools", () => {
  const mcp = (name: string, input: unknown = {}, ctx = production()) =>
    evaluateMcp(name, input, ctx);

  it("ignores servers that are not AWS servers", () => {
    expect(mcp("mcp__playwright__browser_click").decision).toBe("none");
    expect(mcp("mcp__github__create_issue").decision).toBe("none");
    expect(mcp("Bash").decision).toBe("none");
  });

  it("is quiet for documentation, pricing, and validation tools", () => {
    for (const name of [
      "mcp__awslabs-documentation-mcp-server__search_documentation",
      "mcp__awslabs-pricing-mcp-server__get_pricing",
      "mcp__awslabs-iac-mcp-server__validate_cloudformation_template",
      "mcp__plugin_databases-on-aws_aurora-dsql__readonly_query",
      "mcp__awslabs-dynamodb-mcp-server__generate_resources",
    ]) {
      expect(mcp(name).decision).toBe("none");
    }
  });

  it("asks for write-looking and unknown tools in production", () => {
    expect(mcp("mcp__plugin_databases-on-aws_aurora-dsql__transact")).toMatchObject({
      decision: "ask",
      code: "GUARD_PRODUCTION_CHANGE",
    });
    expect(mcp("mcp__plugin_aws-core_aws-mcp__frobnicate").decision).toBe("ask");
    expect(mcp("mcp__plugin_aws-core_aws-mcp__frobnicate", {}, context()).decision).toBe("none");
  });

  it("asks for MCP changes when the identity is not verified", () => {
    expect(
      mcp("mcp__plugin_databases-on-aws_aurora-dsql__transact", {}, context({ snapshot: null }))
        .code,
    ).toBe("GUARD_TARGET_UNVERIFIED");
  });

  it("parses CLI commands carried by an MCP tool like Bash", () => {
    expect(
      mcp("mcp__plugin_aws-core_aws-mcp__call_aws", { cli_command: "aws s3 rb s3://b" }, context())
        .code,
    ).toBe("GUARD_DESTRUCTIVE");
    expect(
      mcp("mcp__plugin_aws-core_aws-mcp__call_aws", { cli_command: "aws s3 ls" }, production())
        .decision,
    ).toBe("none");
  });

  it("honors extra servers from the user's configuration", () => {
    const ctx = { ...production(), config: { ...DEFAULT_CONFIG, mcpServers: ["corp-gateway"] } };
    expect(mcp("mcp__corp-gateway__do_thing", {}, ctx).decision).toBe("ask");
    expect(mcp("mcp__corp-gateway__do_thing", {}, production()).decision).toBe("none");
  });

  it("applies unattended handling", () => {
    const ctx = { ...production(), mode: "bypassPermissions" };
    expect(mcp("mcp__plugin_databases-on-aws_aurora-dsql__transact", {}, ctx).decision).toBe(
      "deny",
    );
  });
});
