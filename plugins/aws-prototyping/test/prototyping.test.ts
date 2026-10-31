import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { redactText } from "@claude-code-aws/safe-output";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PATTERNS } from "../src/lib/catalog.js";
import { runCli } from "../src/lib/cli.js";
import { checkManifest } from "../src/lib/manifest.js";
import { hasWildcardGrant } from "../src/lib/scan.js";
import { simulateQueue, validateModel, type QueueModel } from "../src/lib/sim.js";

const NOW = new Date("2026-10-31T00:00:00Z");
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-proto-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (args: string[]) => runCli(args, { root, now: NOW });
const START = [
  "start",
  "--name",
  "order-queue",
  "--pattern",
  "events-queue-lambda",
  "--hypothesis",
  "Batching keeps p95 under target",
  "--metric",
  "p95_latency_ms",
  "--target",
  "300",
  "--unit",
  "ms",
];
const model = (over: Partial<QueueModel> = {}): QueueModel => ({
  arrivalRatePerSec: 50,
  durationSec: 30,
  serviceMsMean: 100,
  serviceJitter: 0,
  workers: 1000,
  batchSize: 1,
  batchOverheadMs: 0,
  seed: 7,
  ...over,
});

describe("the pattern catalog", () => {
  it("covers the seven spec patterns, and the fixtures contain no secrets or real addresses", () => {
    expect(PATTERNS.map((p) => p.id)).toEqual(
      expect.arrayContaining([
        "api-lambda-dynamodb",
        "events-queue-lambda",
        "s3-ingest",
        "step-functions-workflow",
        "cognito-api",
        "bedrock-request-response",
        "ses-event-flow",
      ]),
    );
    for (const p of PATTERNS) {
      expect(p.fixtures.length, p.id).toBeGreaterThan(0);
      for (const f of p.fixtures)
        expect(
          redactText(JSON.stringify(f.content), { personalData: false }).redacted,
          `${p.id} ${f.file}`,
        ).toBe(0);
    }
  });
});

describe("the queue model", () => {
  it("is deterministic for a seed and differs for another", () => {
    expect(simulateQueue(model())).toEqual(simulateQueue(model()));
    expect(simulateQueue(model({ seed: 8 })).messages).not.toBe(0);
  });

  it("with plenty of workers and no jitter, latency equals the service time", () => {
    const r = simulateQueue(model());
    expect(r.p50_latency_ms).toBe(100);
    expect(r.p95_latency_ms).toBe(100);
    expect(r.max_backlog).toBeLessThanOrEqual(1);
  });

  it("an overloaded queue builds a backlog and more workers fix it", () => {
    const slow = simulateQueue(model({ workers: 1 }));
    expect(slow.max_backlog).toBeGreaterThan(100);
    expect(slow.p95_latency_ms).toBeGreaterThan(1000);
    const fixed = simulateQueue(model({ workers: 10 }));
    expect(fixed.max_backlog).toBeLessThan(slow.max_backlog);
    expect(fixed.p95_latency_ms).toBeLessThan(slow.p95_latency_ms);
  });

  it("refuses unbounded or invalid models", () => {
    expect(validateModel(model({ arrivalRatePerSec: 10_000, durationSec: 600 }))).toMatch(
      /more than/,
    );
    expect(validateModel(model({ workers: 0 }))).not.toBeNull();
    expect(validateModel(model({ serviceJitter: 2 }))).not.toBeNull();
    expect(validateModel(model())).toBeNull();
  });
});

describe("start and validate", () => {
  it("drafts without writing, then writes new files only", async () => {
    const draft = await cli(START);
    expect(draft.stdout).toContain("Draft only");
    expect(existsSync(join(root, "prototypes"))).toBe(false);
    const written = await cli([...START, "--write"]);
    expect(written.stdout).toContain("Created prototypes/order-queue/prototype.yaml");
    expect(written.stdout).toContain("Created prototypes/order-queue/fixtures/sqs-event.json");
    expect(written.stdout).toContain("/aws-infrastructure:scaffold");
    expect((await cli([...START, "--write"])).exitCode).toBe(1);
  });

  it("requires the hypothesis and the metric before it creates anything", async () => {
    expect((await cli(["start", "--name", "x", "--pattern", "s3-ingest"])).exitCode).toBe(2);
    expect((await cli(["start", "--name", "Bad Name", "--pattern", "s3-ingest"])).exitCode).toBe(2);
    expect((await cli(["start", "--name", "x", "--pattern", "nope"])).exitCode).toBe(2);
  });

  it("a fresh prototype validates, with no AWS cost by default", async () => {
    await cli([...START, "--write"]);
    const v = await cli(["validate", "prototypes/order-queue"]);
    expect(v.exitCode).toBe(0);
    const manifest = readFileSync(join(root, "prototypes/order-queue/prototype.yaml"), "utf8");
    expect(manifest).toMatch(/maxUsd: 0/);
    expect(manifest).toMatch(/sandbox: null/);
  });

  it("rejects a prototype without bounds, with wildcard permissions or a production blast radius", () => {
    const bad = {
      schemaVersion: 1,
      name: "x",
      question: "Does this work well enough?",
      hypothesis: "It should work well",
      permissions: ["s3:*"],
      blastRadius: "production data",
      decisionDeadline: "2026-12-01",
    };
    const { manifest, problems } = checkManifest(bad, NOW);
    expect(manifest).toBeNull();
    const text = problems.map((p) => p.message).join("\n");
    expect(text).toMatch(/successMetric/);
    expect(text).toMatch(/budget/);
    expect(text).toMatch(/cleanup/);
    expect(text).toMatch(/wildcard/);
    expect(text).toMatch(/production/);
  });

  it("fails when a file in the prototype holds a secret or a wildcard grant", async () => {
    await cli([...START, "--write"]);
    writeFileSync(
      join(root, "prototypes/order-queue/handler.ts"),
      'const key = "AKIAIOSFODNN7EXAMPLE"; // TODO remove',
    );
    writeFileSync(
      join(root, "prototypes/order-queue/policy.json"),
      '{"Action": "*", "Resource": "*"}',
    );
    const v = await cli(["validate", "prototypes/order-queue"]);
    expect(v.exitCode).toBe(1);
    expect(v.stdout).toMatch(/handler\.ts: contains a secret/);
    expect(v.stdout).toMatch(/policy\.json: grants "\*"/);
    expect(v.stdout).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("warns about a deadline in the past and refuses paths outside the project", async () => {
    await cli([...START, "--deadline", "2026-01-01", "--write"]);
    expect((await cli(["validate", "prototypes/order-queue"])).stdout).toMatch(/in the past/);
    expect((await cli(["validate", "../../etc"])).exitCode).toBe(1);
    expect((await cli(["validate", "prototypes/missing"])).exitCode).toBe(1);
  });
});

describe("experiments, results, and comparison", () => {
  beforeEach(async () => {
    await cli([...START, "--write"]);
  });

  it("runs the local model and labels the output as simulated", async () => {
    const r = await cli([
      "experiment",
      "prototypes/order-queue",
      "--variant",
      "a",
      "--workers",
      "5",
      "--repeat",
      "5",
      "--write",
    ]);
    expect(r.stdout).toMatch(/SIMULATED/);
    expect(readdirSync(join(root, "prototypes/order-queue/results"))).toHaveLength(5);
    const again = await cli([
      "experiment",
      "prototypes/order-queue",
      "--variant",
      "a",
      "--workers",
      "5",
      "--repeat",
      "5",
      "--write",
    ]);
    expect(again.stdout).toMatch(/already exists/);
  });

  it("rejects a variant that is not in the manifest and unbounded runs", async () => {
    expect((await cli(["experiment", "prototypes/order-queue", "--variant", "zzz"])).exitCode).toBe(
      2,
    );
    expect(
      (
        await cli([
          "experiment",
          "prototypes/order-queue",
          "--variant",
          "a",
          "--rate",
          "100000",
          "--duration",
          "3600",
        ])
      ).exitCode,
    ).toBe(2);
    expect(
      (await cli(["experiment", "prototypes/order-queue", "--variant", "a", "--repeat", "500"]))
        .exitCode,
    ).toBe(2);
  });

  it("compares two variants on the same inputs, flags thin samples, and claims no significance", async () => {
    await cli([
      "experiment",
      "prototypes/order-queue",
      "--variant",
      "a",
      "--workers",
      "10",
      "--batch",
      "1",
      "--repeat",
      "5",
      "--write",
    ]);
    await cli([
      "experiment",
      "prototypes/order-queue",
      "--variant",
      "b",
      "--workers",
      "2",
      "--batch",
      "10",
      "--overhead",
      "20",
      "--repeat",
      "2",
      "--write",
    ]);
    const c = await cli(["compare", "prototypes/order-queue"]);
    expect(c.stdout).toMatch(/b\s+simulation\s+p95_latency_ms\s+2/);
    expect(c.stdout).toMatch(/Too few samples.*b\/simulation n=2/);
    expect(c.stdout).not.toMatch(/a\/simulation n=5/);
    expect(c.stdout).toMatch(/Nothing here was measured on AWS/);
    expect(c.stdout).toMatch(/No statistical significance is claimed/);
  });

  it("keeps measured and simulated numbers apart", async () => {
    await cli([
      "experiment",
      "prototypes/order-queue",
      "--variant",
      "a",
      "--repeat",
      "5",
      "--write",
    ]);
    const rec = await cli([
      "record",
      "prototypes/order-queue",
      "--variant",
      "a",
      "--source",
      "measured",
      "--metric",
      "p95_latency_ms=280",
      "--write",
    ]);
    expect(rec.stdout).toContain("Created prototypes/order-queue/results/a-measured-");
    const c = await cli(["compare", "prototypes/order-queue", "--json"]);
    const groups = (
      JSON.parse(c.stdout) as { groups: Array<{ source: string; metric: string; n: number }> }
    ).groups;
    expect(
      groups
        .filter((g) => g.metric === "p95_latency_ms")
        .map((g) => `${g.source}:${g.n}`)
        .sort(),
    ).toEqual(["measured:1", "simulation:5"]);
    expect((await cli(["compare", "prototypes/order-queue"])).stdout).toMatch(
      /shown separately and never combined/,
    );
  });

  it("refuses to record a simulation or a malformed metric by hand", async () => {
    expect(
      (
        await cli([
          "record",
          "prototypes/order-queue",
          "--variant",
          "a",
          "--source",
          "simulation",
          "--metric",
          "x=1",
        ])
      ).exitCode,
    ).toBe(2);
    expect(
      (
        await cli([
          "record",
          "prototypes/order-queue",
          "--variant",
          "a",
          "--source",
          "measured",
          "--metric",
          "x=abc",
        ])
      ).exitCode,
    ).toBe(2);
    expect(
      (await cli(["record", "prototypes/order-queue", "--variant", "a", "--source", "measured"]))
        .exitCode,
    ).toBe(2);
  });

  it("ignores result files that are not results", async () => {
    mkdirSync(join(root, "prototypes/order-queue/results"), { recursive: true });
    writeFileSync(join(root, "prototypes/order-queue/results/junk.json"), '{"hello":1}');
    writeFileSync(join(root, "prototypes/order-queue/results/broken.json"), "{");
    expect((await cli(["compare", "prototypes/order-queue"])).stdout).toMatch(
      /no results recorded/,
    );
  });
});

describe("sandbox, cleanup, and promotion plans", () => {
  beforeEach(async () => {
    await cli([...START, "--write"]);
  });

  it("will not plan a sandbox run without a sandbox, and never deploys", async () => {
    const r = await cli(["sandbox-plan", "prototypes/order-queue"]);
    expect(r.exitCode).toBe(1);
    expect(r.stdout).toMatch(/dedicated sandbox account/);
    const file = join(root, "prototypes/order-queue/prototype.yaml");
    writeFileSync(
      file,
      readFileSync(file, "utf8").replace(
        "sandbox: null",
        "sandbox:\n  accountId: '111122223333'\n  region: us-east-1",
      ),
    );
    const ok = await cli(["sandbox-plan", "prototypes/order-queue"]);
    expect(ok.stdout).toMatch(/nothing was deployed/);
    expect(ok.stdout).toContain("111122223333");
    expect(ok.stdout).toMatch(/\/aws-deploy plan/);
    expect(ok.stdout).toMatch(/Budget: up to 0 USD/);
  });

  it("plans cleanup by tag, with a protected-resource check, and deletes nothing", async () => {
    const r = await cli(["cleanup-plan", "prototypes/order-queue", "--write"]);
    expect(r.stdout).toMatch(/nothing has been deleted/);
    expect(r.stdout).toMatch(/Key=prototype,Values=order-queue/);
    expect(r.stdout).toMatch(/Protected-resource check/);
    expect(r.stdout).toMatch(/none happens without a person approving/);
    expect(r.stdout).not.toMatch(/aws [a-z0-9-]+ (delete|remove|terminate)/);
    expect(existsSync(join(root, "prototypes/order-queue/cleanup-plan.md"))).toBe(true);
  });

  it("promotion lists blockers and fixtures to leave behind, and is not ready without a decision", async () => {
    writeFileSync(
      join(root, "prototypes/order-queue/handler.ts"),
      'const k = "AKIAIOSFODNN7EXAMPLE";',
    );
    const r = await cli(["promote", "prototypes/order-queue"]);
    expect(r.stdout).toMatch(/Not ready: record a decision/);
    expect(r.stdout).toMatch(/handler\.ts: contains a secret/);
    expect(r.stdout).toMatch(/fixtures\/sqs-event\.json: fixture data: do not copy/);
    expect(r.stdout).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(r.stdout).toMatch(/\/aws-deploy/);
  });
});

describe("wildcard grants", () => {
  it("is found in JSON, inline YAML, flow lists, block lists, and list items", () => {
    expect(hasWildcardGrant('{"Action": "*"}')).toBe(true);
    expect(hasWildcardGrant('{"Resource": ["*"]}')).toBe(true);
    expect(hasWildcardGrant("Action: '*'")).toBe(true);
    expect(hasWildcardGrant("  - Action: '*'")).toBe(true);
    expect(hasWildcardGrant("Action: ['s3:Get*', '*']")).toBe(true);
    expect(hasWildcardGrant("Resource:\n  - arn:aws:s3:::a\n  - '*'\nEffect: Allow")).toBe(true);
  });
  it("is not found for specific grants or a wildcard inside a name", () => {
    expect(hasWildcardGrant('{"Action": "s3:GetObject", "Resource": "arn:aws:s3:::b/*"}')).toBe(
      false,
    );
    expect(hasWildcardGrant("Action: s3:Get*")).toBe(false);
    expect(hasWildcardGrant("Resource:\n  - arn:aws:s3:::b/*")).toBe(false);
  });
});

describe("the command line", () => {
  it("rejects unknown commands and options", async () => {
    expect((await cli(["nope", "x"])).exitCode).toBe(2);
    expect((await cli(["validate"])).exitCode).toBe(2);
    expect((await cli(["start", "--bogus"])).exitCode).toBe(2);
    expect((await cli([])).exitCode).toBe(2);
    expect((await cli(["patterns"])).stdout).toContain("ses-event-flow");
  });
});
