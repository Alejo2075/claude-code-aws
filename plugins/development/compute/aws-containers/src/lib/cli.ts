import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { DOCKERIGNORE, nodeDockerfile, reviewDockerfile, STOP_REASONS } from "./docker.js";
import { checkFargateSize, FARGATE } from "./fargate.js";
import { inventory, rules, taskChecks } from "./rules.js";

const pascal = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(pascal);
  if (typeof v === "object" && v !== null)
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k.charAt(0).toUpperCase() + k.slice(1), pascal(x)]),
    );
  return v;
};

export const runCli = defineCli({
  name: "aws-containers",
  promise:
    "Reads files inside the project. Writes only new files with --write. No AWS calls and no Docker: nothing is built, pushed, run, or deployed.",
  valued: ["cpu", "memory", "port", "reason"],
  flags: ["write"],
  commands: {
    inspect: {
      help: "[path]  Task definitions, services, and ECR repositories in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-containers",
          `${rows.length} container resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Image contents, running tasks, and ECR scan results are not visible in a template.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(11)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    "taskdef-check": {
      help: "<taskdef.json>  Check an ECS task definition file (register-task-definition format)",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined)
          return ctx.fail("taskdef-check needs a task definition JSON file", 2);
        const json = ctx.readJson(file, 500_000);
        if (!json.ok) return ctx.fail(json.error);
        const p = pascal(json.value);
        if (typeof p !== "object" || p === null || Array.isArray(p))
          return ctx.fail("the file must be a task definition object");
        const findings = taskChecks(file, p as Record<string, unknown>);
        const report = localReport(
          "aws-containers",
          `${findings.length} finding(s) in ${file}. Source: a task definition file (fixture).`,
          findings,
          ["A task definition file shows configuration, not whether the image runs."],
          ctx.now,
        );
        return reportResult(ctx, report);
      },
    },
    size: {
      help: "--cpu <units> --memory <MiB>  Is this a valid Fargate task size?",
      run: (ctx) => {
        const cpu = ctx.args.num("cpu", Number.NaN);
        const mem = ctx.args.num("memory", Number.NaN);
        if (!Number.isFinite(cpu) || !Number.isFinite(mem))
          return ctx.out(
            [...FARGATE.keys()],
            `size needs --cpu and --memory (MiB). CPU sizes: ${[...FARGATE.keys()].join(", ")}`,
          );
        const problem = checkFargateSize(cpu, mem);
        return {
          exitCode: problem === null ? 0 : 1,
          stdout:
            problem ??
            `${cpu} CPU units with ${mem} MiB is a valid Fargate combination (ECS documentation, read 2026-10-31).`,
        };
      },
    },
    review: {
      help: "<Dockerfile>  Review a Dockerfile",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("review needs a Dockerfile path", 2);
        const text = ctx.readText(file, 200_000);
        if (!text.ok) return ctx.fail(text.error);
        const issues = reviewDockerfile(text.text);
        const errors = issues.filter((i) => i.level === "error").length;
        return {
          exitCode: errors > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(issues, null, 2)
            : issues.length === 0
              ? "No findings."
              : issues
                  .map((i) => `${i.level.toUpperCase().padEnd(7)} line ${i.line}: ${i.message}`)
                  .join("\n"),
        };
      },
    },
    containerize: {
      help: "[--port 3000] [--write]  A multi-stage, non-root Dockerfile and .dockerignore for a Node.js service",
      run: (ctx) => {
        const port = ctx.args.num("port", 3000);
        if (!Number.isInteger(port) || port < 1 || port > 65535)
          return ctx.fail("--port must be 1 to 65535", 2);
        const files = [
          { path: "Dockerfile", content: nodeDockerfile(port) },
          { path: ".dockerignore", content: DOCKERIGNORE },
        ];
        if (!ctx.args.flags.has("write"))
          return ctx.out(
            files,
            `${files.map((f) => `--- ${f.path}\n${f.content}`).join("\n")}\n(Draft only; add --write to create the files. Nothing is built.)`,
          );
        const lines = files.map((f) => ctx.save(f.path, f.content));
        return {
          exitCode: lines.some((l) => l.startsWith("Not written")) ? 1 : 0,
          stdout: lines.join("\n"),
        };
      },
    },
    diagnose: {
      help: "--reason '<stopped reason or exit code>'  Likely causes of a stopped task (hypotheses)",
      run: (ctx) => {
        const reason = ctx.args.one("reason");
        if (reason === undefined || reason.length > 500)
          return ctx.fail(
            "diagnose needs --reason with the stopped reason text (up to 500 characters) from the task details",
            2,
          );
        const hits = STOP_REASONS.filter((r) => r.match.test(reason));
        if (hits.length === 0)
          return ctx.out(
            [],
            "No known pattern matches. Look at the task's stoppedReason, each container's exit code and reason, and its logs; the service events show scheduling problems.",
          );
        return ctx.out(
          hits,
          hits.map((h) => `${h.title}\n${h.causes.map((c) => `- ${c}`).join("\n")}`).join("\n\n") +
            "\nThese are common causes (hypotheses). Confirm with the task details, the logs, and the service events.",
        );
      },
    },
    image: {
      help: "<repository-uri> <tag>  The commands to build and push an image (printed, never run)",
      run: (ctx) => {
        const [repo, tag] = ctx.words;
        if (
          repo === undefined ||
          tag === undefined ||
          !/^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9._/-]+$/.test(repo) ||
          !/^[A-Za-z0-9_.-]{1,128}$/.test(tag)
        )
          return ctx.fail(
            "image needs an ECR repository URI (123456789012.dkr.ecr.us-east-1.amazonaws.com/name) and a tag",
            2,
          );
        const region = repo.split(".")[3] ?? "us-east-1";
        const lines = [
          "NOT RUN. Pushing an image changes the registry and, with a mutable or latest tag, can change what a service runs. Review, then run in the right account:",
          `  aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${repo.split("/")[0] ?? ""}`,
          `  docker build --platform linux/amd64 -t ${repo}:${tag} .`,
          `  docker push ${repo}:${tag}`,
          "",
          "Use a unique tag per build (a commit id), not latest; match --platform to the task's RuntimePlatform; deploying the new image goes through /aws-deploy.",
        ];
        return ctx.out({ repo, tag }, lines.join("\n"));
      },
    },
  },
});
