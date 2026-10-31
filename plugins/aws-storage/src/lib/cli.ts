import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { inventory, rules } from "./rules.js";
import { checkKey, checkLifecycle, parseSize, planUpload, reviewBucketPolicy } from "./tools.js";

export const runCli = defineCli({
  name: "aws-storage",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it reads, writes, copies, and deletes no objects or files.",
  valued: ["size", "part-mib"],
  commands: {
    inspect: {
      help: "[path]  Buckets, file systems, and access points in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-storage",
          `${rows.length} storage resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Account-level Block Public Access and organization policies can change the effective result; a template does not show them.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(13)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    "key-check": {
      help: "<key>  Problems with an object key built from user input",
      run: (ctx) => {
        const key = ctx.words.join(" ");
        const problems = checkKey(key);
        const bad = problems.some((p) => p.level === "error");
        return {
          exitCode: bad ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(problems, null, 2)
            : problems.map((p) => `${p.level}: ${p.message}`).join("\n"),
        };
      },
    },
    "upload-plan": {
      help: "--size 2GiB [--part-mib 16]  Single PUT or multipart, part size and count",
      run: (ctx) => {
        const bytes = parseSize(ctx.args.one("size") ?? "");
        if (bytes === null)
          return ctx.fail("upload-plan needs --size such as 500MiB, 2GiB, or 123456 (bytes)", 2);
        const part =
          ctx.args.one("part-mib") === undefined ? undefined : ctx.args.num("part-mib", Number.NaN);
        if (part !== undefined && (!Number.isInteger(part) || part < 5))
          return ctx.fail("--part-mib must be a whole number of at least 5", 2);
        const p = planUpload(bytes, part);
        return ctx.out(
          p,
          `${p.method}${p.partSizeMiB === undefined ? "" : `: ${p.parts} part(s) of ${p.partSizeMiB} MiB`}\n${p.notes.map((n) => `- ${n}`).join("\n")}\nLimits: parts 5 MiB to 5 GiB, at most 10,000 parts, objects up to 48.8 TiB (S3 multipart upload limits).`,
        );
      },
    },
    lifecycle: {
      help: "<lifecycle.json>  Structural checks of lifecycle rules",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("lifecycle needs a JSON file", 2);
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        const problems = checkLifecycle(json.value);
        return {
          exitCode: problems.length > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(problems, null, 2)
            : problems.length === 0
              ? "No structural problems. Minimum storage durations and transition costs depend on the storage class: check the S3 pricing and storage class pages before choosing days."
              : problems.map((p) => `- ${p}`).join("\n"),
        };
      },
    },
    access: {
      help: "<bucket-policy.json>  Review a bucket policy",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("access needs a policy JSON file", 2);
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        const f = reviewBucketPolicy(json.value);
        return ctx.out(
          f,
          f.length === 0
            ? "No findings in the policy statements."
            : f.map((x) => `[${x.severity}] ${x.message}`).join("\n"),
        );
      },
    },
  },
});
