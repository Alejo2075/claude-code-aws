import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { analyze, migrationPlan, parseModel, queryCost } from "./model.js";
import { inventory, rules } from "./rules.js";

export const runCli = defineCli({
  name: "aws-database",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it reads and writes no rows, and a migration is a plan for you to review.",
  valued: ["items", "item-kb"],
  flags: ["consistent", "index"],
  commands: {
    inspect: {
      help: "[path]  DynamoDB tables and Aurora clusters in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-database",
          `${rows.length} database resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared). No rows were read.`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Item counts, sizes, hot keys, and real access patterns are not visible in a template.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(7)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    model: {
      help: "<model.json>  Which key or index serves each access pattern; what needs a Scan; suggested indexes",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined)
          return ctx.fail(
            "model needs a JSON file: {table:{pk,sk}, indexes:[{name,pk,sk}], patterns:[{id, equals:[attrs], range}]}",
            2,
          );
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        const parsed = parseModel(json.value);
        if (!parsed.ok) return ctx.fail(parsed.error);
        const r = analyze(parsed.model);
        const text = [
          `${r.served.length} of ${parsed.model.patterns.length} pattern(s) are served by a key or index:`,
          ...r.served.map((s) => `  ${s.id}: ${s.via} - ${s.note}`),
          ...(r.scans.length === 0
            ? []
            : ["", "Not served by any key:", ...r.scans.map((s) => `  ${s.id}: ${s.why}`)]),
          ...(r.suggestions.length === 0
            ? []
            : [
                "",
                "Suggested new indexes:",
                ...r.suggestions.map(
                  (s) =>
                    `  ${s.index.name} (pk ${s.index.pk}${s.index.sk === undefined ? "" : `, sk ${s.index.sk}`}) for ${s.forPattern}`,
                ),
              ]),
          ...r.warnings.map((w) => `Warning: ${w}`),
          "",
          "Design follows the queries you list. Patterns you did not list will not be served; say how often each runs before adding indexes.",
        ].join("\n");
        return ctx.out(r, text);
      },
    },
    query: {
      help: "--items n --item-kb k [--consistent] [--index]  Read capacity units for a Query that reads n items",
      run: (ctx) => {
        const items = ctx.args.num("items", Number.NaN);
        const kb = ctx.args.num("item-kb", Number.NaN);
        if (!Number.isFinite(items) || !Number.isFinite(kb) || items < 0 || kb <= 0)
          return ctx.fail(
            "query needs --items and --item-kb (item size in KB) from your own data",
            2,
          );
        const c = queryCost(
          items,
          kb,
          ctx.args.flags.has("consistent"),
          ctx.args.flags.has("index"),
        );
        return ctx.out(
          c,
          `${c.rcu} read capacity unit(s) (estimate), ${c.pages} call(s).\n${c.note.map((n) => `- ${n}`).join("\n")}\nOne RCU is one strongly consistent read of up to 4 KB; eventually consistent reads cost half.`,
        );
      },
    },
    "migrate-plan": {
      help: "<before.json> <after.json>  Steps to move from one key design to another (a plan, never run)",
      run: (ctx) => {
        const [a, b] = ctx.words;
        if (a === undefined || b === undefined)
          return ctx.fail("migrate-plan needs two model files", 2);
        const x = ctx.readJson(a);
        const y = ctx.readJson(b);
        if (!x.ok) return ctx.fail(x.error);
        if (!y.ok) return ctx.fail(y.error);
        const before = parseModel(x.value);
        const after = parseModel(y.value);
        if (!before.ok) return ctx.fail(`${a}: ${before.error}`);
        if (!after.ok) return ctx.fail(`${b}: ${after.error}`);
        const plan = migrationPlan(before.model, after.model);
        return ctx.out(
          plan,
          [
            "PLAN ONLY. Nothing was changed.",
            ...plan.changes.map((c) => `Change: ${c}`),
            ...plan.steps.map(
              (s, i) => `${i + 1}. ${s.step}${s.risk === undefined ? "" : `\n   Risk: ${s.risk}`}`,
            ),
            "Run each step yourself in a test environment first, with point-in-time recovery on the source table.",
          ].join("\n"),
        );
      },
    },
  },
});
