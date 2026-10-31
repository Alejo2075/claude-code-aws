// Cross-plugin scenarios from the unified spec (section 8). Each plugin is used through its own
// command line, and plugins hand data to each other only as files in documented formats, exactly as a
// user would. Nothing here calls AWS.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli as architect } from "../../plugins/aws-architect/src/lib/cli.js";
import { runCli as diagrams } from "../../plugins/aws-diagrams/src/lib/cli.js";
import { runCli as events } from "../../plugins/aws-events/src/lib/cli.js";
import { runCli as prototyping } from "../../plugins/aws-prototyping/src/lib/cli.js";
import { runCli as security } from "../../plugins/aws-security/src/lib/cli.js";
import { runCli as wellArchitected } from "../../plugins/aws-well-architected/src/lib/cli.js";
import { runCli as workflows } from "../../plugins/aws-workflows/src/lib/cli.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures", "serverless");
const NOW = new Date("2026-10-31T00:00:00Z");

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "scenario-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const put = (name: string, content: string): void => {
  mkdirSync(join(root, name, ".."), { recursive: true });
  writeFileSync(join(root, name), content);
};
const copyApp = (fixture: string): void => {
  cpSync(join(FIXTURES, fixture), join(root, "cdk.out"), { recursive: true });
};
const LOCAL_CONTEXT = {
  accountId: null,
  region: null,
  profile: null,
  identityVerified: false,
  environment: "unknown" as const,
};
const secDeps = {
  root: "",
  context: () => LOCAL_CONTEXT,
  exclusions: () => ({ exclusions: [], warnings: [] }),
  now: NOW,
};

describe("visualize CDK stacks (Infrastructure data to Diagrams)", () => {
  it("labels declared and inferred links and keeps the Mermaid source, with no UI present", async () => {
    copyApp("cdk.out.orders");
    const r = await diagrams(["from-cdk", "cdk.out", "--write", "--name", "orders"], {
      root,
      now: NOW,
      env: {},
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toMatch(/-->\|"event source"\|/);
    expect(r.stdout).toMatch(/-\.->\|"permitted by IAM \(inferred\)"\|/);
    expect(readFileSync(join(root, "docs/architecture/diagrams/orders.mmd"), "utf8")).toContain(
      "flowchart",
    );
    const artifact = JSON.parse(
      readFileSync(join(root, "docs/architecture/diagrams/orders.json"), "utf8"),
    ) as { kind: string; provenance: string[] };
    expect(artifact.kind).toBe("DiagramArtifact");
    expect(artifact.provenance.join(" ")).toMatch(/declared/);
  });
});

describe("assess an existing project (Security evidence into Well-Architected)", () => {
  it("merges the real output of the security audit as automated-inference evidence, and reports the rest as missing", async () => {
    copyApp("cdk.out.orders");
    put(
      "cdk.out/Flawed.template.json",
      readFileSync(join(FIXTURES, "templates", "flawed.v1.template.json"), "utf8"),
    );
    const audit = await security(["audit", "cdk.out", "--json"], { ...secDeps, root });
    const report = JSON.parse(audit.stdout) as { findings?: unknown[] };
    expect(Array.isArray(report.findings)).toBe(true);
    put("reports/security.json", audit.stdout);
    const r = await wellArchitected(
      ["review", "cdk.out", "--report", "reports/security.json", "--json"],
      { root, now: NOW },
    );
    const review = JSON.parse(r.stdout) as {
      questions: Array<{ id: string; status: string; strongest: string | null }>;
      missing: unknown[];
      disclaimer: string;
      coverage: { verified: number };
    };
    expect(review.disclaimer).toMatch(/not an official AWS/);
    expect(review.coverage.verified).toBe(0);
    expect(review.missing.length).toBeGreaterThan(5);
    const least = review.questions.find((q) => q.id === "SEC-LEAST-PRIVILEGE");
    expect(least?.status).toBe("gap");
    expect(least?.strongest).toBe("automated-inference");
    const tenant = review.questions.find((q) => q.id === "SEC-TENANT-ISOLATION");
    expect(tenant?.status).toBe("unknown");
  });
});

describe("design, then picture, then prototype (Architect, Diagrams, Prototyping)", () => {
  it("passes the plan as a file: intended nodes in the diagram, a bounded prototype that validates", async () => {
    const plan = await architect(
      [
        "plan",
        "init",
        "--title",
        "Orders",
        "--requirements",
        JSON.stringify({ workload: "orders api", latency: "300 ms p95" }),
      ],
      { root, now: NOW },
    );
    const doc = JSON.parse(plan.stdout) as {
      components: unknown[];
      integrations: unknown[];
      openQuestions: string[];
    };
    doc.components = [
      { id: "api", kind: "http-api", name: "Orders API", purpose: "entry" },
      { id: "queue", kind: "queue", name: "Orders queue", purpose: "buffer" },
      { id: "worker", kind: "function", name: "Worker", purpose: "process" },
    ];
    doc.integrations = [
      { from: "api", to: "queue", style: "async" },
      { from: "queue", to: "worker", style: "async" },
    ];
    put("docs/plan.json", JSON.stringify(doc));
    expect(
      (await architect(["plan", "check", "docs/plan.json"], { root, now: NOW })).stdout,
    ).toMatch(/2 integration/);
    const d = await diagrams(["generate", "--from", "docs/plan.json", "--type", "event-flow"], {
      root,
      now: NOW,
      env: {},
    });
    expect(d.stdout).toContain("(intended)");
    expect(d.stdout).toContain("Source: architecture plan (intended)");
    const start = await prototyping(
      [
        "start",
        "--name",
        "orders-queue",
        "--pattern",
        "events-queue-lambda",
        "--hypothesis",
        "A queue keeps p95 under target",
        "--metric",
        "p95_latency_ms",
        "--target",
        "300",
        "--write",
      ],
      { root, now: NOW },
    );
    expect(start.exitCode).toBe(0);
    const validate = await prototyping(["validate", "prototypes/orders-queue"], { root, now: NOW });
    expect(validate.exitCode).toBe(0);
    const sim = await prototyping(
      ["experiment", "prototypes/orders-queue", "--variant", "a", "--repeat", "5", "--write"],
      { root, now: NOW },
    );
    expect(sim.stdout).toMatch(/SIMULATED/);
    const compare = await prototyping(["compare", "prototypes/orders-queue"], { root, now: NOW });
    expect(compare.stdout).toMatch(/Nothing here was measured on AWS/);
    expect(
      (await prototyping(["sandbox-plan", "prototypes/orders-queue"], { root, now: NOW })).exitCode,
    ).toBe(1);
  });
});

describe("diagram a live event flow and a workflow (Events and Workflows into Diagrams)", () => {
  it("draws the routing graph that aws-events exports, and the state graph of a definition", async () => {
    put(
      "cdk.out/S.template.json",
      JSON.stringify({
        Resources: {
          Bus: { Type: "AWS::Events::EventBus", Properties: { Name: "b" } },
          Q: { Type: "AWS::SQS::Queue", Properties: {} },
          Rule: {
            Type: "AWS::Events::Rule",
            Properties: {
              EventPattern: { source: ["a"] },
              Targets: [{ Id: "t", Arn: { "Fn::GetAtt": ["Q", "Arn"] } }],
            },
          },
        },
      }),
    );
    const graph = await events(["graph", "cdk.out", "--json"], { root, now: NOW });
    put("graphs/events.json", graph.stdout);
    const d = await diagrams(["generate", "--from", "graphs/events.json", "--type", "event-flow"], {
      root,
      now: NOW,
      env: {},
    });
    expect(d.exitCode).toBe(0);
    expect(d.stdout).toMatch(/rule target/);
    put(
      "sm.json",
      JSON.stringify({
        StartAt: "A",
        States: {
          A: {
            Type: "Task",
            Resource: "arn:aws:states:::lambda:invoke",
            TimeoutSeconds: 5,
            Next: "B",
            Catch: [{ ErrorEquals: ["States.ALL"], Next: "Fail" }],
          },
          B: { Type: "Succeed" },
          Fail: { Type: "Fail" },
        },
      }),
    );
    expect((await workflows(["validate", "sm.json"], { root, now: NOW })).stdout).toMatch(/^Valid/);
    const sg = await diagrams(["from-asl", "sm.json"], { root, now: NOW, env: {} });
    expect(sg.stdout).toMatch(/"catch"/);
  });
});

describe("the ownership rules hold", () => {
  const NEW = [
    "aws-diagrams",
    "aws-prototyping",
    "aws-well-architected",
    "aws-lambda",
    "aws-api",
    "aws-auth",
    "aws-events",
    "aws-messaging",
    "aws-workflows",
    "aws-database",
    "aws-storage",
    "aws-streaming",
    "aws-edge",
    "aws-ai",
    "aws-containers",
    "aws-email",
    "aws-config",
  ];
  const sources = (plugin: string): string[] => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
          ? walk(join(dir, e.name))
          : e.name.endsWith(".ts")
            ? [join(dir, e.name)]
            : [],
      );
    return walk(join(import.meta.dirname, "..", "..", "plugins", plugin, "src"));
  };

  it("none of the seventeen new plugins imports an AWS SDK client: they cannot call AWS", () => {
    for (const plugin of NEW)
      for (const file of sources(plugin))
        expect(readFileSync(file, "utf8"), file).not.toMatch(
          /@aws-sdk\/|from "aws-sdk"|require\("aws-sdk"\)/,
        );
  });

  it("only the diagram exporter starts a process, and only through the shared runner", () => {
    for (const plugin of NEW)
      for (const file of sources(plugin)) {
        const text = readFileSync(file, "utf8");
        if (/node:child_process/.test(text))
          throw new Error(`${file} imports child_process directly`);
        if (/runTool\(/.test(text)) expect(plugin, file).toBe("aws-diagrams");
      }
  });

  it("every new plugin refuses an unknown command and a path outside the project", async () => {
    const r = await architect(["nope"], { root, now: NOW });
    expect(r.exitCode).toBe(2);
    const out = await diagrams(["from-cdk", "../../outside"], { root, now: NOW, env: {} });
    expect(out.exitCode).toBe(1);
  });
});
