import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { inventory, rules } from "./rules.js";
import { distribution, lagHypotheses, recordCheck, shardsNeeded } from "./tools.js";

export const runCli = defineCli({
  name: "aws-streaming",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it puts and gets no records and starts no load.",
  valued: [
    "write-mb",
    "records",
    "read-mb",
    "consumers",
    "shards",
    "keys",
    "bytes",
    "max-mib",
    "iterator-age-ms",
    "incoming-mb",
    "throttled",
    "errors",
  ],
  flags: ["efo"],
  commands: {
    inspect: {
      help: "[path]  Streams, delivery streams, and stream consumers in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-streaming",
          `${rows.length} stream resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Lag, throttling, and delivery failures are run-time facts; use `diagnose` with numbers you read.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(16)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    shards: {
      help: "--write-mb n --records n --read-mb n [--consumers n] [--efo]  Shards needed (provisioned mode)",
      run: (ctx) => {
        const input = {
          writeMbPerSec: ctx.args.num("write-mb", Number.NaN),
          recordsPerSec: ctx.args.num("records", Number.NaN),
          readMbPerSec: ctx.args.num("read-mb", Number.NaN),
          consumers: ctx.args.num("consumers", 1),
          enhancedFanOut: ctx.args.flags.has("efo"),
        };
        if (
          [input.writeMbPerSec, input.recordsPerSec, input.readMbPerSec, input.consumers].some(
            (v) => !Number.isFinite(v) || v < 0,
          )
        )
          return ctx.fail(
            "shards needs --write-mb, --records, and --read-mb (non-negative numbers) from your own measurements or forecast",
            2,
          );
        const r = shardsNeeded(input);
        return ctx.out(
          r,
          `At least ${r.shards} shard(s): ${r.byWrite} for write bandwidth, ${r.byRecords} for record rate, ${r.byRead} for reads.\n${r.notes.map((n) => `- ${n}`).join("\n")}\nThis is an estimate from the numbers you gave (estimate, not a measurement).`,
        );
      },
    },
    "partition-check": {
      help: "<keys.json> --shards n  Where sample partition keys land and whether one key is hot",
      run: (ctx) => {
        const file = ctx.words[0];
        const shards = ctx.args.num("shards", Number.NaN);
        if (file === undefined || !Number.isInteger(shards) || shards < 1 || shards > 10_000)
          return ctx.fail(
            "partition-check needs a JSON file with a list of sample keys and --shards (1 to 10000)",
            2,
          );
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        if (
          !Array.isArray(json.value) ||
          json.value.length === 0 ||
          json.value.length > 100_000 ||
          !json.value.every((k) => typeof k === "string")
        )
          return ctx.fail("the file must be a list (up to 100000) of partition key strings");
        const d = distribution(json.value, shards);
        const text = [
          `${d.keys} sample key(s), ${d.distinct} distinct, across ${shards} equal shard range(s):`,
          ...d.perShard.map((n, i) => `  shard ${i}: ${n} (${((n / d.keys) * 100).toFixed(1)}%)`),
          ...(d.warnings.length === 0
            ? ["No hot-key warnings."]
            : d.warnings.map((w) => `Warning: ${w}`)),
          "Placement uses the MD5 hash of the key over equal ranges, which matches a stream that has never been resharded. A sample shows skew in the sample only.",
        ];
        return ctx.out(d, text.join("\n"));
      },
    },
    "record-check": {
      help: "--bytes n [--max-mib 1]  Does a record fit the stream's size limit?",
      run: (ctx) => {
        const bytes = ctx.args.num("bytes", Number.NaN);
        const max = ctx.args.num("max-mib", 1);
        if (!Number.isFinite(bytes) || bytes < 0 || !(max >= 1 && max <= 10))
          return ctx.fail("record-check needs --bytes and an optional --max-mib from 1 to 10", 2);
        const r = recordCheck(bytes, max);
        return {
          exitCode: r.ok ? 0 : 1,
          stdout: ctx.json ? JSON.stringify(r, null, 2) : r.message,
        };
      },
    },
    diagnose: {
      help: "--iterator-age-ms n --incoming-mb n --shards n --throttled n --errors n  Hypotheses about lag from metrics you read",
      run: (ctx) => {
        const g = (n: string): number => ctx.args.num(n, Number.NaN);
        const i = {
          iteratorAgeMs: g("iterator-age-ms"),
          incomingMbPerSec: g("incoming-mb"),
          shards: g("shards"),
          throttledWrites: g("throttled"),
          lambdaErrors: g("errors"),
        };
        if (Object.values(i).some((v) => !Number.isFinite(v) || v < 0))
          return ctx.fail(
            "diagnose needs --iterator-age-ms --incoming-mb --shards --throttled --errors (read from CloudWatch)",
            2,
          );
        const h = lagHypotheses(i);
        return ctx.out(
          h,
          `Hypotheses (from the numbers you gave):\n${h.map((x, n) => `${n + 1}. ${x}`).join("\n")}`,
        );
      },
    },
  },
});
