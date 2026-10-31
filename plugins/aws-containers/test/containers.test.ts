import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import { reviewDockerfile, STOP_REASONS } from "../src/lib/docker.js";
import { checkFargateSize } from "../src/lib/fargate.js";
import { rules } from "../src/lib/rules.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-cnt-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });

describe("Fargate sizes (from the ECS documentation table)", () => {
  it("accepts documented combinations", () => {
    for (const [cpu, mem] of [
      [256, 512],
      [256, 2048],
      [512, 1024],
      [1024, 8192],
      [2048, 16384],
      [4096, 30720],
      [8192, 16384],
      [8192, 61440],
      [16384, 32768],
      [32768, 249856],
    ] as const)
      expect(checkFargateSize(cpu, mem), `${cpu}/${mem}`).toBeNull();
  });
  it("rejects undocumented ones", () => {
    expect(checkFargateSize(256, 4096)).toMatch(/not valid with 256/);
    expect(checkFargateSize(1024, 1024)).toMatch(/not valid/);
    expect(checkFargateSize(8192, 18432)).toMatch(/not valid/);
    expect(checkFargateSize(300, 512)).toMatch(/not a Fargate size/);
    expect(checkFargateSize(32768, 100 * 1024)).toMatch(/not valid/);
  });
});

describe("template rules", () => {
  it("finds task, service, and repository problems without echoing secret values", () => {
    const p = parseTemplate({
      Resources: {
        Td: {
          Type: "AWS::ECS::TaskDefinition",
          Properties: {
            RequiresCompatibilities: ["FARGATE"],
            Cpu: "256",
            Memory: "4096",
            ContainerDefinitions: [
              {
                Name: "app",
                Image: "repo/app:latest",
                Privileged: true,
                Environment: [{ Name: "DB_PASSWORD", Value: "hunter2hunter2" }],
              },
            ],
          },
        },
        Svc: {
          Type: "AWS::ECS::Service",
          Properties: {
            NetworkConfiguration: { AwsvpcConfiguration: { AssignPublicIp: "ENABLED" } },
          },
        },
        Repo: { Type: "AWS::ECR::Repository", Properties: {} },
      },
    });
    if (!p.ok) throw new Error(p.error);
    const found = rules("S", p.template);
    const ids = found.map((f) => f.ruleId);
    for (const id of [
      "CNT-FARGATE-SIZE",
      "CNT-NO-EXECUTION-ROLE",
      "CNT-IMAGE-TAG",
      "CNT-NO-LOGS",
      "CNT-SECRET-IN-ENV",
      "CNT-PRIVILEGED",
      "CNT-WRITABLE-ROOT",
      "CNT-RUNS-AS-ROOT",
      "CNT-NO-HEALTHCHECK",
      "CNT-PUBLIC-IP",
      "CNT-NO-CIRCUIT-BREAKER",
      "CNT-ECR-NO-SCAN",
      "CNT-ECR-MUTABLE-TAGS",
      "CNT-ECR-NO-LIFECYCLE",
    ])
      expect(ids, id).toContain(id);
    expect(JSON.stringify(found)).not.toContain("hunter2hunter2");
  });
  it("accepts a digest-pinned image", () => {
    const p = parseTemplate({
      Resources: {
        Td: {
          Type: "AWS::ECS::TaskDefinition",
          Properties: {
            RequiresCompatibilities: ["FARGATE"],
            Cpu: "256",
            Memory: "512",
            ExecutionRoleArn: "x",
            TaskRoleArn: "y",
            ContainerDefinitions: [
              {
                Name: "a",
                Image: "repo/app@sha256:abc",
                LogConfiguration: {},
                ReadonlyRootFilesystem: true,
                User: "1000",
                HealthCheck: {},
              },
            ],
          },
        },
      },
    });
    if (!p.ok) throw new Error(p.error);
    expect(rules("S", p.template)).toEqual([]);
  });
});

describe("Dockerfile review", () => {
  const msgs = (t: string) =>
    reviewDockerfile(t)
      .map((i) => `${i.level}:${i.line} ${i.message}`)
      .join("\n");
  it("finds the usual problems", () => {
    const m = msgs(
      "FROM node:latest\nENV API_TOKEN=abc123xyz\nADD https://example.com/x.tgz /x\nRUN curl https://x.example/i.sh | sh\nRUN apt-get update && apt-get install -y curl\nCOPY . .\nRUN npm ci\n",
    );
    expect(m).toMatch(/no pinned tag/);
    expect(m).toMatch(/error:2 ENV API_TOKEN looks like a secret/);
    expect(m).toMatch(/ADD from a URL/);
    expect(m).toMatch(/error:4 piping a download/);
    expect(m).toMatch(/--no-install-recommends/);
    expect(m).toMatch(/lists are not removed/);
    expect(m).toMatch(/COPY \. \. comes before/);
    expect(m).toMatch(/no USER/);
    expect(m).toMatch(/single-stage/);
  });
  it("accepts the generated Dockerfile apart from pinning", async () => {
    const r = await cli(["containerize", "--port", "8080"]);
    expect(r.stdout).toContain("USER node");
    expect(r.stdout).toContain("EXPOSE 8080");
    writeFileSync(
      join(root, "Dockerfile"),
      'FROM node:22-slim AS build\nRUN true\nFROM node:22-slim\nUSER node\nCMD ["node"]\n',
    );
    expect((await cli(["review", "Dockerfile"])).exitCode).toBe(0);
    expect(msgs("FROM scratch\nUSER 1000\nCOPY a /a\n")).not.toMatch(/pinned/);
    expect(msgs("")).toMatch(/no instructions/);
  });
});

describe("stopped task reasons", () => {
  it("matches known patterns", () => {
    const find = (s: string) => STOP_REASONS.filter((r) => r.match.test(s)).map((r) => r.title);
    expect(find("CannotPullContainerError: pull image manifest has been retried")[0]).toMatch(
      /could not be pulled/,
    );
    expect(find("Container killed due to memory usage, exit code 137")[0]).toMatch(/memory/);
    expect(find("Essential container in task exited")[0]).toMatch(/essential container/);
    expect(find("ResourceInitializationError: unable to pull secrets")[0]).toMatch(/initialize/);
    expect(find("Task failed ELB health checks")[0]).toMatch(/Health checks/);
    expect(find("exec format error")[0]).toMatch(/Architecture/);
    expect(find("something unrelated")).toEqual([]);
  });
});

describe("the command line", () => {
  it("runs each command and never builds or pushes", async () => {
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(
      join(root, "cdk.out/S.template.json"),
      JSON.stringify({ Resources: { R: { Type: "AWS::ECR::Repository", Properties: {} } } }),
    );
    expect((await cli(["inspect"])).stdout).toContain("CNT-ECR-NO-SCAN");
    writeFileSync(
      join(root, "td.json"),
      JSON.stringify({
        requiresCompatibilities: ["FARGATE"],
        cpu: "256",
        memory: "4096",
        containerDefinitions: [{ name: "a", image: "x:latest" }],
      }),
    );
    expect((await cli(["taskdef-check", "td.json"])).stdout).toContain("CNT-FARGATE-SIZE");
    expect((await cli(["size", "--cpu", "256", "--memory", "512"])).exitCode).toBe(0);
    expect((await cli(["size", "--cpu", "256", "--memory", "4096"])).exitCode).toBe(1);
    expect((await cli(["containerize", "--write"])).stdout).toContain("Created Dockerfile");
    expect((await cli(["containerize", "--write"])).exitCode).toBe(1);
    expect((await cli(["containerize", "--port", "99999"])).exitCode).toBe(2);
    expect((await cli(["diagnose", "--reason", "CannotPullContainerError"])).stdout).toMatch(
      /NAT|endpoint/,
    );
    expect((await cli(["diagnose"])).exitCode).toBe(2);
    const img = await cli(["image", "123456789012.dkr.ecr.us-east-1.amazonaws.com/app", "abc123"]);
    expect(img.stdout).toMatch(/NOT RUN/);
    expect(img.stdout).toContain(
      "docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/app:abc123",
    );
    expect((await cli(["image", "evil.example.com/app; rm -rf /", "x"])).exitCode).toBe(2);
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});
