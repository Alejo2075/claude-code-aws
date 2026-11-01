import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { validateFlags } from "./flags.js";
import { inventory, rules } from "./rules.js";
import { rolloutPlan, validateAgainst } from "./schema.js";

export const runCli = defineCli({
  name: "aws-config",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it deploys nothing and changes no flag or parameter.",
  valued: ["schema", "type", "growth", "minutes", "bake"],
  commands: {
    inspect: {
      help: "[path]  AppConfig and Parameter Store resources in cdk.out, with findings (parameter values are not shown)",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-config",
          `${rows.length} configuration resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Deployed flag values and the current deployment status are not visible in a template.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(12)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    flags: {
      help: "<flags.json>  Validate an AWS.AppConfig.FeatureFlags document",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("flags needs a feature flag JSON file", 2);
        const json = ctx.readJson(file, 500_000);
        if (!json.ok) return ctx.fail(json.error);
        const issues = validateFlags(json.value);
        const errors = issues.filter((i) => i.level === "error").length;
        return {
          exitCode: errors > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(issues, null, 2)
            : issues.length === 0
              ? "Valid feature flag document."
              : `${issues.map((i) => `${i.level.toUpperCase().padEnd(7)} ${i.path} ${i.message}`).join("\n")}\n${errors} error(s), ${issues.length - errors} warning(s).`,
        };
      },
    },
    validate: {
      help: "<config.json> --schema <schema.json>  Check free-form configuration against a JSON Schema subset",
      run: (ctx) => {
        const file = ctx.words[0];
        const schemaFile = ctx.args.one("schema");
        if (file === undefined || schemaFile === undefined)
          return ctx.fail("validate needs a configuration file and --schema <file>", 2);
        const data = ctx.readJson(file, 1_000_000);
        const schema = ctx.readJson(schemaFile, 200_000);
        if (!data.ok) return ctx.fail(data.error);
        if (!schema.ok) return ctx.fail(schema.error);
        const errors = validateAgainst(data.value, schema.value);
        return {
          exitCode: errors.length > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(errors, null, 2)
            : errors.length === 0
              ? "The configuration satisfies the schema subset checked here (type, required, properties, additionalProperties false, enum, ranges, lengths, pattern, items)."
              : errors.map((e) => `- ${e}`).join("\n"),
        };
      },
    },
    "rollout-plan": {
      help: "--type linear|exponential --growth n --minutes n [--bake n]  Timeline of a gradual rollout",
      run: (ctx) => {
        const type = ctx.args.one("type") ?? "linear";
        const growth = ctx.args.num("growth", Number.NaN);
        const minutes = ctx.args.num("minutes", Number.NaN);
        const bake = ctx.args.num("bake", 0);
        if (
          (type !== "linear" && type !== "exponential") ||
          !(growth > 0 && growth <= 100) ||
          !(minutes >= 0 && minutes <= 1440) ||
          !(bake >= 0 && bake <= 1440)
        )
          return ctx.fail(
            "rollout-plan needs --type linear|exponential, --growth 1-100, --minutes 0-1440, and optionally --bake 0-1440",
            2,
          );
        const p = rolloutPlan(type, growth, minutes, bake);
        return ctx.out(
          p,
          [
            `PLAN ONLY. Nothing was deployed.`,
            ...p.steps.map(
              (s) => `  minute ${String(s.minute).padEnd(7)} ${s.percent}% of targets`,
            ),
            `  minute ${p.bakeUntilMinute} end of bake time`,
            ...p.notes.map((n) => `- ${n}`),
          ].join("\n"),
        );
      },
    },
  },
});
