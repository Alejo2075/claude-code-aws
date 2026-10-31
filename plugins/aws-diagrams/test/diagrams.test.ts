import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import type { Runner } from "../src/lib/render.js";
import { renderImage } from "../src/lib/render.js";

const FIXTURES = join(import.meta.dirname, "..", "..", "..", "tests", "fixtures", "serverless");
const NOW = new Date("2026-10-31T00:00:00Z");

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-diagrams-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (args: string[], extra = {}) =>
  runCli(args, { root, now: NOW, env: { PATH: "" }, ...extra });
const put = (name: string, value: unknown): void => {
  writeFileSync(join(root, name), typeof value === "string" ? value : JSON.stringify(value));
};

describe("from-cdk", () => {
  it("draws a real cdk.out with declared and inferred links and says what it is", async () => {
    const result = await runCli(["from-cdk", "cdk.out.orders"], {
      root: FIXTURES,
      now: NOW,
      env: {},
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("flowchart LR");
    expect(result.stdout).toMatch(/-->\|"event source"\|/);
    expect(result.stdout).toMatch(/-\.->\|"permitted by IAM \(inferred\)"\|/);
    expect(result.stdout).toContain("Source: synthesized templates (declared)");
    expect(result.stdout).toContain("not what is deployed");
  });

  it("refuses paths outside the project and reports a missing directory", async () => {
    expect((await runCli(["from-cdk", "../.."], { root: FIXTURES, env: {} })).exitCode).toBe(1);
    expect((await cli(["from-cdk", "nothing"])).stdout).toMatch(/does not exist/);
  });

  it("writes new files under docs/architecture/diagrams and never overwrites", async () => {
    // Use a scratch copy so the fixture tree stays clean.
    mkdirSync(join(root, "cdk.out"), { recursive: true });
    for (const f of ["manifest.json", "OrdersStack.template.json"])
      writeFileSync(join(root, "cdk.out", f), readFileSync(join(FIXTURES, "cdk.out.orders", f)));
    const one = await cli(["from-cdk", "--write", "--name", "orders"]);
    expect(one.stdout).toContain("Created docs/architecture/diagrams/orders.mmd");
    const again = await cli(["from-cdk", "--write", "--name", "orders"]);
    expect(again.stdout).toContain("already exists");
    expect(readFileSync(join(root, "docs/architecture/diagrams/orders.mmd"), "utf8")).toContain(
      "flowchart",
    );
  });
});

describe("generate", () => {
  it("draws an architecture plan as intended", async () => {
    put("plan.json", {
      schemaVersion: "1",
      title: "Orders",
      generatedAt: "2026-10-31T00:00:00Z",
      requirements: {},
      components: [
        { id: "api", kind: "http-api", name: "Orders API", purpose: "x" },
        { id: "q", kind: "queue", name: "Orders queue", purpose: "y" },
      ],
      integrations: [{ from: "api", to: "q", style: "async" }],
      assumptions: [],
      risks: [],
      openQuestions: [],
    });
    const result = await cli(["generate", "--from", "plan.json"]);
    expect(result.stdout).toContain('-.->|"async (intended)"|');
    expect(result.stdout).toContain("Source: architecture plan (intended)");
  });

  it("groups an inventory by account and region and does not claim observation", async () => {
    put("inv.json", {
      resources: [
        { id: "a", kind: "function", name: "A", account: "111122223333", region: "us-east-1" },
        { id: "b", kind: "function", name: "B", account: "444455556666", region: "eu-west-1" },
      ],
      relations: [{ from: "a", to: "b", label: "invoke" }],
    });
    const result = await cli(["generate", "--from", "inv.json", "--type", "trust-boundaries"]);
    expect(result.stdout).toContain("111122223333 / us-east-1");
    expect(result.stdout).toContain("444455556666 / eu-west-1");
    expect(result.stdout).toContain("(inferred)");
    expect(result.stdout).not.toContain("==>");
  });

  it("redacts secrets in labels before drawing", async () => {
    put("g.json", {
      schemaVersion: "1",
      title: "T",
      nodes: [
        { id: "a", kind: "function", label: "token AKIAIOSFODNN7EXAMPLE", basis: "declared" },
      ],
      edges: [],
      notes: [],
    });
    const result = await cli(["generate", "--from", "g.json"]);
    expect(result.stdout).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(result.stdout).toMatch(/redacted/);
  });

  it("rejects unknown documents, bad types, and invalid graphs", async () => {
    put("x.json", { hello: 1 });
    expect((await cli(["generate", "--from", "x.json"])).exitCode).toBe(1);
    expect((await cli(["generate", "--from", "x.json", "--type", "nope"])).exitCode).toBe(2);
    put("bad.json", {
      schemaVersion: "1",
      title: "T",
      nodes: [],
      edges: [{ from: "a", to: "b", label: "x", basis: "declared" }],
      notes: [],
    });
    expect((await cli(["generate", "--from", "bad.json"])).stdout).toMatch(/not valid|not a node/);
  });
});

describe("from-asl", () => {
  it("draws a state machine with choice and catch paths", async () => {
    put("sm.json", {
      StartAt: "Validate",
      States: {
        Validate: {
          Type: "Task",
          Next: "Route",
          Catch: [{ ErrorEquals: ["States.ALL"], Next: "Failed" }],
        },
        Route: { Type: "Choice", Choices: [{ Next: "Done" }], Default: "Failed" },
        Done: { Type: "Succeed" },
        Failed: { Type: "Fail" },
      },
    });
    const result = await cli(["from-asl", "sm.json"]);
    expect(result.stdout).toMatch(/"catch"/);
    expect(result.stdout).toMatch(/"default"/);
    expect((await cli(["from-asl", "x-missing.json"])).exitCode).toBe(1);
  });
});

describe("validate, update, diff", () => {
  const graph = {
    schemaVersion: "1",
    title: "T",
    nodes: [
      { id: "a", kind: "function", label: "A", basis: "declared" },
      { id: "b", kind: "queue", label: "B", basis: "declared" },
    ],
    edges: [{ from: "a", to: "b", label: "send", basis: "declared" }],
    notes: [],
  };

  it("validates and reports a dangling edge with exit code 1", async () => {
    put("g.json", graph);
    expect((await cli(["validate", "g.json"])).stdout).toMatch(/Valid: 2 node/);
    put("bad.json", { ...graph, edges: [{ from: "a", to: "zz", label: "x", basis: "declared" }] });
    const bad = await cli(["validate", "bad.json"]);
    expect(bad.exitCode).toBe(1);
    expect(bad.stdout).toMatch(/not a node/);
  });

  it("updates incrementally and writes the result only as a new file", async () => {
    put("g.json", graph);
    put("change.json", {
      addNodes: [{ id: "c", kind: "table", label: "C", basis: "declared" }],
      addEdges: [{ from: "b", to: "c", label: "store", basis: "declared" }],
    });
    const preview = await cli(["update", "g.json", "--change", "change.json"]);
    expect(preview.stdout).toContain("+1/-0 nodes");
    expect(existsSync(join(root, "g2.json"))).toBe(false);
    const saved = await cli([
      "update",
      "g.json",
      "--change",
      "change.json",
      "--out",
      "g2.json",
      "--write",
    ]);
    expect(saved.stdout).toContain("Created g2.json");
    const again = await cli([
      "update",
      "g.json",
      "--change",
      "change.json",
      "--out",
      "g2.json",
      "--write",
    ]);
    expect(again.exitCode).toBe(1);
    expect(JSON.parse(readFileSync(join(root, "g.json"), "utf8"))).toEqual(graph);
  });

  it("diffs two graphs with removed parts colored", async () => {
    put("a.json", graph);
    put("b.json", { ...graph, nodes: [graph.nodes[0]], edges: [] });
    const result = await cli(["diff", "a.json", "b.json"]);
    expect(result.stdout).toContain("- b (queue)");
    expect(result.stdout).toMatch(/class n_b removed/);
  });
});

describe("export", () => {
  const g = {
    schemaVersion: "1",
    title: "T",
    nodes: [{ id: "a", kind: "function", label: "A", basis: "declared" }],
    edges: [],
    notes: [],
  };

  it("always writes the source, and says so when no renderer is installed", async () => {
    put("g.json", g);
    const result = await cli(["export", "g.json", "--out", "out/diagram", "--format", "svg"]);
    expect(result.stdout).toContain("Created out/diagram.mmd");
    expect(result.stdout).toMatch(/No Mermaid renderer found/);
    expect(result.exitCode).toBe(0);
  });

  it("writes the image when a renderer exists (fake renderer)", async () => {
    put("g.json", g);
    const bin = join(root, "node_modules", "@mermaid-js", "mermaid-cli");
    mkdirSync(bin, { recursive: true });
    writeFileSync(
      join(bin, "package.json"),
      JSON.stringify({ name: "@mermaid-js/mermaid-cli", bin: { mmdc: "cli.js" } }),
    );
    writeFileSync(join(bin, "cli.js"), "");
    const run: Runner = (options) => {
      const out = options.args[options.args.indexOf("-o") + 1] as string;
      writeFileSync(out, "<svg/>");
      return Promise.resolve({
        exitCode: 0,
        signal: null,
        stdout: "",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        timedOut: false,
        durationMs: 1,
        spawnError: null,
      });
    };
    const result = await runCliWith(run);
    expect(result.stdout).toContain("Created out/d.svg");
    expect(readFileSync(join(root, "out/d.svg"), "utf8")).toBe("<svg/>");
  });

  it("does not claim an image when the renderer fails", async () => {
    const result = await renderImage("flowchart LR", "svg", root, { PATH: "" });
    expect(result.ok).toBe(false);
  });

  function runCliWith(run: Runner) {
    return cli(["export", "g.json", "--out", "out/d", "--format", "svg"], { run });
  }
});

describe("the command line", () => {
  it("rejects unknown commands and options", async () => {
    expect((await cli(["nope"])).exitCode).toBe(2);
    expect((await cli(["generate", "--bogus"])).exitCode).toBe(2);
    expect((await cli([])).exitCode).toBe(2);
  });
});
