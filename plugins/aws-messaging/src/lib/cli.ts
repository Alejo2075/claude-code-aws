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

import { inventory, rules } from "./rules.js";
import { attributesToValues, checkFifoSend, diagnoseBacklog } from "./tools.js";

export const runCli = defineCli({
  name: "aws-messaging",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it sends, receives, deletes, or redrives no messages.",
  valued: [
    "scope",
    "group",
    "dedup",
    "visible",
    "in-flight",
    "oldest",
    "receive-rate",
    "send-rate",
    "visibility",
    "retention",
    "dlq",
  ],
  flags: ["content-based"],
  commands: {
    inspect: {
      help: "[path]  Queues, topics, and subscriptions in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-messaging",
          `${rows.length} queue/topic/subscription resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Queue depth, message age, and receive counts are run-time facts that a template cannot show; use `diagnose` with numbers you read.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(13)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    "filter-test": {
      help: "<policy.json> <message.json> [--scope attributes|body]  Does an SNS filter policy accept the message?",
      run: (ctx) => {
        const [p, m] = ctx.words;
        if (p === undefined || m === undefined)
          return ctx.fail("filter-test needs a policy file and a message file", 2);
        const scope = ctx.args.one("scope") ?? "attributes";
        if (scope !== "attributes" && scope !== "body")
          return ctx.fail("--scope must be attributes or body", 2);
        const policy = ctx.readJson(p, MAX_PATTERN_BYTES);
        const message = ctx.readJson(m, 1_000_000);
        if (!policy.ok) return ctx.fail(policy.error);
        if (!message.ok) return ctx.fail(message.error);
        const problems = checkPattern(policy.value);
        if (problems.length > 0)
          return ctx.fail(
            `The policy is not valid:\n${problems.map((x) => `  ${x.path}: ${x.message}`).join("\n")}`,
          );
        let subject: Json;
        if (scope === "attributes") {
          const converted = attributesToValues(message.value);
          if (!converted.ok) return ctx.fail(converted.error);
          subject = converted.value;
        } else subject = message.value as Json;
        const pattern = policy.value as { [k: string]: Json };
        const ok = matches(pattern, subject);
        const why = ok ? [] : explainMiss(pattern, subject);
        return ctx.out(
          { matches: ok, scope, why },
          ok
            ? `DELIVERED: the ${scope} satisfy the filter policy.\n(Checked locally with EventBridge-style operators; SNS supports a similar but not identical set. SNS is the authority.)`
            : `FILTERED OUT:\n${why.map((x) => `  ${x}`).join("\n")}\n(Checked locally; SNS is the authority.)`,
        );
      },
    },
    "fifo-check": {
      help: "--group <id> [--dedup <id>] [--content-based]  What a send to a FIFO queue needs",
      run: (ctx) => {
        const problems = checkFifoSend({
          ...(ctx.args.one("group") === undefined
            ? {}
            : { groupId: ctx.args.one("group") as string }),
          ...(ctx.args.one("dedup") === undefined
            ? {}
            : { dedupId: ctx.args.one("dedup") as string }),
          contentBased: ctx.args.flags.has("content-based"),
        });
        const note =
          "Ordering holds within one message group id. Many groups give parallelism; a single group id serializes everything. FIFO queues limit each partition to 300 transactions per second per API action (3,000 messages with batching) unless high throughput mode is on.";
        return ctx.out(
          { ok: problems.length === 0, problems },
          problems.length === 0
            ? `The send is valid for a FIFO queue.\n${note}`
            : `${problems.map((p) => `- ${p}`).join("\n")}\n${note}`,
        );
      },
    },
    diagnose: {
      help: "--visible n --in-flight n --oldest s --send-rate n --receive-rate n --visibility s --retention s --dlq n  Hypotheses from numbers you read",
      run: (ctx) => {
        const get = (n: string): number => ctx.args.num(n, Number.NaN);
        const input = {
          visible: get("visible"),
          inFlight: get("in-flight"),
          oldestAgeSeconds: get("oldest"),
          receiveRatePerSec: get("receive-rate"),
          sendRatePerSec: get("send-rate"),
          visibilitySeconds: get("visibility"),
          retentionSeconds: get("retention"),
          dlqDepth: get("dlq"),
        };
        if (Object.values(input).some((v) => !Number.isFinite(v) || v < 0))
          return ctx.fail(
            "diagnose needs every number: --visible --in-flight --oldest --send-rate --receive-rate --visibility --retention --dlq (non-negative). Read them from CloudWatch; this command does not.",
            2,
          );
        const hyp = diagnoseBacklog(input);
        return ctx.out(
          hyp,
          `Hypotheses (from the numbers you gave, not from the queue):\n${hyp.map((h, i) => `${i + 1}. ${h.statement}\n   Basis: ${h.basis}\n   Check next: ${h.next}`).join("\n")}`,
        );
      },
    },
  },
});
