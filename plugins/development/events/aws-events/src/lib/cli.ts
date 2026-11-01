import { type ArchitectureGraph, fromStacks, toMermaid } from "@claude-code-aws/architecture-graph";
import {
  checkPattern,
  explainMiss,
  type Json,
  matches,
  MAX_PATTERN_BYTES,
} from "@claude-code-aws/content-filter";
import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { ENVELOPE, ENVELOPE_GUIDANCE, inventory, rules } from "./rules.js";
import { nextRuns, parseSchedule, validZone } from "./schedule.js";

const EVENT_KINDS = new Set([
  "bus",
  "rule",
  "queue",
  "topic",
  "function",
  "state-machine",
  "stream",
  "delivery-stream",
  "bucket",
]);

export const runCli = defineCli({
  name: "aws-events",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it publishes no events and creates no rules or schedules.",
  valued: ["tz", "count", "from"],
  commands: {
    inspect: {
      help: "[path]  Buses, rules, targets, and schedules in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-events",
          `${rows.length} bus/rule/schedule resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Event patterns are not evaluated against real traffic here; use `test`.",
          ],
          ctx.now,
        );
        const text = [...rows.map((r) => `  ${r.kind.padEnd(9)} ${r.id}  ${r.detail}`)];
        return reportResult(ctx, report, [`Resources:\n${text.join("\n")}`, ...problems]);
      },
    },
    graph: {
      help: "[path]  The bus, rule, and target graph as ArchitectureGraph JSON (for aws-diagrams) and Mermaid",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const full = fromStacks(stacks);
        const nodes = full.nodes.filter((n) => EVENT_KINDS.has(n.kind));
        const ids = new Set(nodes.map((n) => n.id));
        const graph: ArchitectureGraph = {
          ...full,
          title: "Event routing",
          nodes,
          edges: full.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
        };
        return ctx.out(
          graph,
          `${toMermaid(graph)}\n\nSolid arrows are declared in the templates. Render with /aws-diagrams if installed.`,
        );
      },
    },
    test: {
      help: "<pattern.json> <event.json>  Does the event match the pattern? Says which fields miss",
      run: (ctx) => {
        const [p, e] = ctx.words;
        if (p === undefined || e === undefined)
          return ctx.fail("test needs a pattern file and an event file", 2);
        const pattern = ctx.readJson(p, MAX_PATTERN_BYTES);
        const event = ctx.readJson(e, 1_000_000);
        if (!pattern.ok) return ctx.fail(pattern.error);
        if (!event.ok) return ctx.fail(event.error);
        const problems = checkPattern(pattern.value);
        if (problems.length > 0)
          return ctx.fail(
            `The pattern is not valid:\n${problems.map((x) => `  ${x.path}: ${x.message}`).join("\n")}`,
          );
        const ok = matches(pattern.value as { [k: string]: Json }, event.value as Json);
        const why = ok
          ? []
          : explainMiss(pattern.value as { [k: string]: Json }, event.value as Json);
        return ctx.out(
          { matches: ok, why },
          ok
            ? "MATCH: the event matches the pattern.\n(Checked locally. EventBridge itself is the authority; use TestEventPattern for the final word.)"
            : `NO MATCH:\n${why.map((x) => `  ${x}`).join("\n")}\n(Checked locally. EventBridge itself is the authority.)`,
        );
      },
    },
    schedule: {
      help: "<expression> [--tz Zone] [--count 5] [--from ISO]  Validate at()/rate()/cron() and list the next runs",
      run: (ctx) => {
        const expression = ctx.words.join(" ");
        if (expression === "")
          return ctx.fail("schedule needs an expression, e.g. 'cron(0 12 * * ? *)'", 2);
        const parsed = parseSchedule(expression);
        if (!parsed.ok) return ctx.fail(`Not a valid expression: ${parsed.error}`);
        const zone = ctx.args.one("tz") ?? "UTC";
        if (!validZone(zone))
          return ctx.fail(
            `unknown time zone ${zone}; use an IANA name such as America/New_York`,
            2,
          );
        const count = ctx.args.num("count", 5);
        if (!Number.isInteger(count) || count < 1 || count > 50)
          return ctx.fail("--count must be 1 to 50", 2);
        const from =
          ctx.args.one("from") === undefined ? ctx.now : new Date(ctx.args.one("from") ?? "");
        if (Number.isNaN(from.getTime())) return ctx.fail("--from must be an ISO date and time", 2);
        const runs = nextRuns(parsed.value, zone, from, count);
        const text = [
          `Valid. Time zone ${zone}. Next ${runs.length} run(s) after ${from.toISOString()}:`,
          ...runs.map(
            (r) =>
              `  ${r.utc.padEnd(21)} local ${r.local}${r.note === undefined ? "" : `  (${r.note})`}`,
          ),
          "Computed locally; Scheduler is the authority, especially around daylight saving changes.",
        ];
        return ctx.out({ expression, zone, runs }, text.join("\n"));
      },
    },
    envelope: {
      help: "Print a versioned event envelope and the rules behind it",
      run: (ctx) =>
        ctx.out(
          { envelope: ENVELOPE, guidance: ENVELOPE_GUIDANCE },
          `${JSON.stringify(ENVELOPE, null, 2)}\n\n${ENVELOPE_GUIDANCE.map((g) => `- ${g}`).join("\n")}`,
        ),
    },
  },
});
