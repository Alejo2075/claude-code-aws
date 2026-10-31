import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { cdkAssertionsTest, handlerTest } from "../src/lib/generate.js";
import { KINDS } from "../src/lib/fixtures.js";
import { runTests } from "../src/lib/runner.js";
import { FIXTURES, tempProject } from "./helpers.js";

const created: string[] = [];
afterEach(() => {
  for (const root of created.splice(0)) rmSync(root, { recursive: true, force: true });
});
const project = (files: Record<string, string>): string => {
  const root = tempProject(files);
  created.push(root);
  return root;
};
const template = (name: string) => {
  const parsed = parseTemplate(
    readFileSync(join(FIXTURES, "templates", `${name}.template.json`), "utf8"),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.template;
};
const syntaxProblems = (source: string): string[] =>
  (
    ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).diagnostics ?? []
  ).map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));

describe("cdk-assertions generator", () => {
  it.each(["orders.v1", "s3-ingest.v1", "auth-api.v1", "flawed.v1"])(
    "emits valid TypeScript for %s with only the checks its resource types need",
    (name) => {
      const file = cdkAssertionsTest(
        "Stack",
        "cdk.out/Stack.template.json",
        template(name),
        "test/Stack.assertions.test.ts",
      );
      if ("error" in file) throw new Error(file.error);
      expect(syntaxProblems(file.content)).toEqual([]);
      expect(file.content).toContain("never allows every action on every resource");
      expect(file.content.includes("point-in-time recovery")).toBe(
        name === "orders.v1" || name === "flawed.v1",
      );
      expect(file.content.includes("blocks public access on every bucket")).toBe(
        name === "s3-ingest.v1" || name === "flawed.v1",
      );
      expect(file.content).toContain('"../cdk.out/Stack.template.json"');
    },
  );

  it("rejects an unsafe stack name", () => {
    expect(
      cdkAssertionsTest("../x", "cdk.out/a.json", template("orders.v1"), "test/x.test.ts"),
    ).toHaveProperty("error");
  });
});

describe("handler generator", () => {
  it.each(KINDS)("emits valid TypeScript for %s", (kind) => {
    const file = handlerTest("/proj", "src/handler.mjs", kind, "test/handler.test.ts");
    if ("error" in file) throw new Error(file.error);
    expect(syntaxProblems(file.content)).toEqual([]);
    expect(file.content).toContain('from "../src/handler.mjs"');
    expect(file.content).toContain("it.todo");
  });

  it("refuses unknown kinds, bad export names, and handlers outside the project", () => {
    expect(handlerTest("/proj", "a.mjs", "kinesis", "t.ts")).toHaveProperty("error");
    expect(handlerTest("/proj", "a.mjs", "sqs", "t.ts", "bad name")).toHaveProperty("error");
    expect(handlerTest("/proj", "../outside.mjs", "sqs", "t.ts")).toHaveProperty("error");
  });

  it("generates an SQS test that passes against a correct handler and fails against a careless one", async () => {
    const correct = `export const handler = async (event) => {
  const seen = new Set();
  const batchItemFailures = [];
  for (const record of event.Records) {
    if (seen.has(record.messageId)) continue;
    seen.add(record.messageId);
    try { JSON.parse(record.body); } catch { batchItemFailures.push({ itemIdentifier: record.messageId }); }
  }
  return { batchItemFailures };
};\n`;
    const careless =
      "export const handler = async (event) => { for (const r of event.Records) JSON.parse(r.body); };\n";
    const root = project({ "src/handler.mjs": correct });
    const generated = await runCli(["generate", "handler", "src/handler.mjs", "sqs", "--write"], {
      root,
      env: {},
    });
    expect(generated.stdout).toContain("Created test/handler.test.ts");
    // The generated file is a .test.ts; the temporary project's config picks up .t.ts, so rename it.
    writeFileSync(
      join(root, "test", "handler.t.ts"),
      readFileSync(join(root, "test", "handler.test.ts"), "utf8"),
    );
    const ok = await runTests({ root, env: { PATH: process.env["PATH"] } });
    if (!ok.ok) throw new Error(ok.message);
    expect(ok.report).toMatchObject({ failed: 0 });
    expect(ok.report.passed).toBeGreaterThanOrEqual(4);
    writeFileSync(join(root, "src", "handler.mjs"), careless);
    const bad = await runTests({ root, env: { PATH: process.env["PATH"] } });
    if (!bad.ok) throw new Error(bad.message);
    expect(bad.report.failed).toBeGreaterThan(0);
  }, 90_000);
});

describe("generate and contracts commands", () => {
  it("only list the files without --write, and never overwrite with it", async () => {
    const root = project({});
    const dry = await runCli(["contracts", "write", "sqs", "--dir", "test/fixtures", "--all"], {
      root,
      env: {},
    });
    expect(dry.stdout).toContain("add --write");
    const wet = await runCli(
      ["contracts", "write", "sqs", "--dir", "test/fixtures", "--all", "--write"],
      { root, env: {} },
    );
    expect(wet.stdout).toContain("Created test/fixtures/sqs.json");
    expect(wet.stdout).toContain("sqs.batch-one-bad.json");
    expect(
      (
        await runCli(["contracts", "write", "sqs", "--dir", "test/fixtures", "--write"], {
          root,
          env: {},
        })
      ).stdout,
    ).toContain("Skipped test/fixtures/sqs.json");
    expect(
      (
        await runCli(["contracts", "write", "sqs", "--dir", "../outside", "--write"], {
          root,
          env: {},
        })
      ).stdout,
    ).toContain("Skipped");
  });

  it("builds assertions from a cdk.out in the project", async () => {
    const root = project({});
    writeFileSync(
      join(root, "OrdersStack.template.json"),
      readFileSync(join(FIXTURES, "templates", "orders.v1.template.json")),
    );
    const missing = await runCli(["generate", "cdk-assertions", "OrdersStack", "--cdk-out", "."], {
      root,
      env: {},
    });
    expect(missing.stdout).toContain("OrdersStack.template.json".replace(".template.json", ""));
    const created = await runCli(
      ["generate", "cdk-assertions", "OrdersStack", "--cdk-out", ".", "--write"],
      { root, env: {} },
    );
    expect(created.stdout).toContain("Created test/OrdersStack.assertions.test.ts");
    expect(readFileSync(join(root, "test", "OrdersStack.assertions.test.ts"), "utf8")).toContain(
      "point-in-time recovery",
    );
    expect(
      (await runCli(["generate", "cdk-assertions", "Nope", "--cdk-out", "."], { root, env: {} }))
        .stdout,
    ).toContain("was not found");
  });

  it("shows, lists, and checks contracts", async () => {
    const root = project({});
    expect(
      JSON.parse((await runCli(["contracts", "show", "eventbridge"], { root, env: {} })).stdout),
    ).toMatchObject({ source: "app.orders" });
    expect(
      (await runCli(["contracts", "show", "sqs", "--variant", "nope"], { root, env: {} })).exitCode,
    ).toBe(2);
    expect((await runCli(["contracts", "list"], { root, env: {} })).stdout).toContain(
      "batch-one-bad",
    );
    expect(
      (
        await runCli(
          ["contracts", "check", "sqs", '{"batchItemFailures":[{"itemIdentifier":"x"}]}'],
          { root, env: {} },
        )
      ).stdout,
    ).toContain("expected shape");
    expect(
      (
        await runCli(["contracts", "check", "apigw-http-v2", '{"statusCode":"200"}'], {
          root,
          env: {},
        })
      ).stdout,
    ).toContain("not valid");
    expect(
      (await runCli(["contracts", "check", "sqs", "{ nope"], { root, env: {} })).exitCode,
    ).toBe(2);
  });

  it("rejects unknown commands and has no deploy or AWS verb", async () => {
    const root = project({});
    for (const argv of [
      [],
      ["deploy"],
      ["run", "--framework", "mocha"],
      ["run", "--bogus"],
      ["generate"],
      ["contracts"],
    ]) {
      expect((await runCli(argv, { root, env: {} })).exitCode).toBe(2);
    }
    expect((await runCli([], { root, env: {} })).stdout).toContain("never deploy");
  });
});
