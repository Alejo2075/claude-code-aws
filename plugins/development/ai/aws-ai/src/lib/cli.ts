import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { inventory, rules } from "./rules.js";
import {
  AVAILABILITY,
  budget,
  chunk,
  EVAL_DATASET,
  EVAL_RUNNER,
  reviewRag,
  reviewTools,
  scanPrompt,
  type Tool,
} from "./tools.js";

const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const NAME = /^[a-z][a-z0-9-]{0,40}$/;

export const runCli = defineCli({
  name: "aws-ai",
  promise:
    "Reads files inside the project. Writes only new files with --write. No AWS calls and no model calls: nothing is invoked, so nothing is billed.",
  valued: [
    "requests",
    "input-tokens",
    "output-tokens",
    "price-in",
    "price-out",
    "size",
    "overlap",
    "region",
    "name",
  ],
  flags: ["write"],
  commands: {
    inspect: {
      help: "[path]  Bedrock agents, knowledge bases, guardrails, and model permissions in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-ai",
          `${rows.length} Bedrock resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Whether a model is available, enabled, and within quota in a region is an account fact; see `availability`.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(15)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    availability: {
      help: "--region <r>  The read-only commands that show which models exist in a region (never assume a model is enabled)",
      run: (ctx) => {
        const region = ctx.args.one("region");
        if (region === undefined || !REGION.test(region))
          return ctx.fail("availability needs --region such as us-east-1", 2);
        return ctx.out(
          AVAILABILITY(region),
          `Run these yourself (reads):\n${AVAILABILITY(region)
            .map((l) => `  ${l}`)
            .join("\n")}`,
        );
      },
    },
    budget: {
      help: "--requests n --input-tokens n --output-tokens n --price-in <per 1M> --price-out <per 1M>  Cost estimate from prices you supply",
      run: (ctx) => {
        const g = (n: string): number => ctx.args.num(n, Number.NaN);
        const i = {
          requests: g("requests"),
          inputTokens: g("input-tokens"),
          outputTokens: g("output-tokens"),
          priceInPerMillion: g("price-in"),
          priceOutPerMillion: g("price-out"),
        };
        if (Object.values(i).some((v) => !Number.isFinite(v) || v < 0))
          return ctx.fail(
            "budget needs --requests --input-tokens --output-tokens --price-in --price-out (non-negative numbers; prices per million tokens from the Bedrock pricing page)",
            2,
          );
        const b = budget(i);
        return ctx.out(
          b,
          `ESTIMATE: ${b.total.toFixed(2)} for ${i.requests} request(s) (${b.perRequest.toFixed(4)} each): input ${b.inputCost.toFixed(2)}, output ${b.outputCost.toFixed(2)} (in the currency of your prices).\n${b.notes.map((n) => `- ${n}`).join("\n")}`,
        );
      },
    },
    chunk: {
      help: "<file.txt> [--size 500] [--overlap 50] [--write]  Split a document into overlapping chunks (about 4 characters per token)",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("chunk needs a text file", 2);
        const size = ctx.args.num("size", 500);
        const overlap = ctx.args.num("overlap", 50);
        if (
          !Number.isInteger(size) ||
          size < 20 ||
          size > 8000 ||
          !Number.isInteger(overlap) ||
          overlap < 0
        )
          return ctx.fail(
            "--size must be 20 to 8000 tokens and --overlap a non-negative whole number",
            2,
          );
        const text = ctx.readText(file, 5_000_000);
        if (!text.ok) return ctx.fail(text.error);
        const chunks = chunk(text.text, size, overlap);
        const summary = {
          chunks: chunks.length,
          sizes: chunks.map((c) => c.approxTokens),
          size,
          overlap,
        };
        const lines = [
          `${chunks.length} chunk(s) of about ${size} tokens with ${overlap} overlap. Sizes: ${chunks
            .slice(0, 20)
            .map((c) => c.approxTokens)
            .join(", ")}${chunks.length > 20 ? ", ..." : ""}`,
          "Token counts are approximate (4 characters per token); the model's own tokenizer decides the real count. Chunks prefer to end at a paragraph or sentence.",
        ];
        if (ctx.args.flags.has("write"))
          lines.push(
            ctx.save(
              `${file.replace(/\.[^.]+$/, "")}.chunks.jsonl`,
              `${chunks.map((c) => JSON.stringify({ id: c.index, start: c.start, end: c.end, text: c.text })).join("\n")}\n`,
            ),
          );
        return ctx.out(summary, lines.join("\n"));
      },
    },
    "prompt-check": {
      help: "<prompt.txt>  Count secrets and personal data in a prompt before it goes to any model (values are not repeated)",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("prompt-check needs a text file", 2);
        const text = ctx.readText(file, 2_000_000);
        if (!text.ok) return ctx.fail(text.error);
        const r = scanPrompt(text.text);
        return {
          exitCode: r.safeToSend ? 0 : 1,
          stdout: ctx.json
            ? JSON.stringify({ ...r, preview: undefined }, null, 2)
            : r.safeToSend
              ? "Nothing sensitive was detected by these patterns. That does not prove the prompt is free of personal data: names, addresses, and health details are not detectable by pattern."
              : `Found ${r.redactedCount} sensitive value(s): ${Object.entries(r.kinds)
                  .map(([k, n]) => `${n} ${k}`)
                  .join(
                    ", ",
                  )}.\nRedact them, or use Bedrock Guardrails sensitive-information filters, before sending. Values are not shown here.`,
        };
      },
    },
    "rag-review": {
      help: "<rag.json>  Review retrieval settings (chunking, overlap, top-k, dimensions, citations, filters, evaluation)",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("rag-review needs a JSON file of settings", 2);
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        if (typeof json.value !== "object" || json.value === null || Array.isArray(json.value))
          return ctx.fail("the file must be an object of settings");
        const f = reviewRag(json.value);
        return ctx.out(
          f,
          f.length === 0 ? "No findings in the settings given." : f.map((x) => `- ${x}`).join("\n"),
        );
      },
    },
    "agent-review": {
      help: "<tools.json>  Review the tools an agent may call: effect, approval, scope, input validation",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined)
          return ctx.fail(
            "agent-review needs a JSON list of tools [{name, effect, approval, scope, inputSchema}]",
            2,
          );
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        const tools = Array.isArray(json.value) ? json.value : null;
        if (
          tools === null ||
          tools.some(
            (t: unknown) =>
              typeof t !== "object" ||
              t === null ||
              typeof (t as Tool).name !== "string" ||
              !["read", "write", "delete", "external"].includes((t as Tool).effect),
          )
        )
          return ctx.fail("each tool needs a name and an effect: read, write, delete, or external");
        const f = reviewTools(tools as Tool[]);
        return ctx.out(
          f,
          f.length === 0 ? "No findings." : f.map((x) => `[${x.severity}] ${x.message}`).join("\n"),
        );
      },
    },
    "eval-scaffold": {
      help: "--name <slug> [--write]  A dataset and runner skeleton for quality, safety, and grounding checks (no model calls)",
      run: (ctx) => {
        const name = ctx.args.one("name");
        if (name === undefined || !NAME.test(name))
          return ctx.fail("eval-scaffold needs --name (lowercase letters, digits, dashes)", 2);
        const files = [
          { path: `evals/${name}/dataset.jsonl`, content: `${EVAL_DATASET}\n` },
          { path: `evals/${name}/run.mjs`, content: EVAL_RUNNER },
        ];
        if (!ctx.args.flags.has("write"))
          return ctx.out(
            files,
            `${files.map((f) => `--- ${f.path}\n${f.content}`).join("\n")}\n(Draft only; add --write to create these files. The runner calls no model until you implement callModel.)`,
          );
        const lines = files.map((f) => ctx.save(f.path, f.content));
        return {
          exitCode: lines.some((l) => l.startsWith("Not written")) ? 1 : 0,
          stdout: lines.join("\n"),
        };
      },
    },
  },
});
