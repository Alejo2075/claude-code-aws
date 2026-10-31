import { isAbsolute, resolve } from "node:path";

import { renderTestReport } from "./render.js";
import { loadStacks } from "@claude-code-aws/template-analysis/node";
import { safeText } from "@claude-code-aws/safe-output";
import { isInside } from "@claude-code-aws/tool-runner";

import { readCoverage, renderCoverage } from "./coverage.js";
import {
  baseEvent,
  fixture,
  isKind,
  KINDS,
  SOURCES,
  validateHttpResponse,
  validateSqsBatchResponse,
  variantNames,
} from "./fixtures.js";
import { cdkAssertionsTest, handlerTest, writeFiles } from "./generate.js";
import { changedFiles, type Framework, type Runner, runTests } from "./runner.js";

export const USAGE = `Usage: aws-testing <command> [options]

  run [--affected] [--coverage] [--framework vitest|jest|node:test]   Run the project's tests (no AWS credentials)
  coverage                                  Read coverage/coverage-summary.json
  contracts list                            Event kinds and their variants
  contracts show <kind> [--variant <name>]  Print an event fixture
  contracts write <kind> --dir <dir> [--all]    Write fixture files (never overwrites)
  contracts check <sqs|apigw-http-v2|apigw-rest-v1> '<response JSON>' ['<event JSON>']   Validate a handler response
  generate cdk-assertions <stack> [--cdk-out cdk.out] [--write]   Policy assertions from a synthesized template
  generate handler <file> <kind> [--write]  A test skeleton for a Lambda handler

Options: --json   --write (to create files; otherwise the files are only listed)

Tests never deploy and never use your AWS credentials.`;

export interface CliResult {
  exitCode: number;
  stdout: string;
}

export interface CliDeps {
  root: string;
  env: Record<string, string | undefined>;
  run?: Runner;
  now?: Date;
}

const usageError = (message: string): CliResult => ({
  exitCode: 2,
  stdout: `${message}\n\n${USAGE}`,
});
const plain = (text: string): string =>
  safeText(text, { maxLines: 600, maxLineLength: 500, maxChars: 120_000 }, { personalData: false })
    .text;

export async function runCli(argv: readonly string[], deps: CliDeps): Promise<CliResult> {
  const words: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (["json", "write", "affected", "coverage", "all"].includes(name)) options.set(name, true);
    else if (["framework", "variant", "dir", "cdk-out", "export"].includes(name)) {
      const value = argv[i + 1];
      if (value === undefined) return usageError(`--${name} needs a value`);
      options.set(name, value);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = options.has("json");
  const write = options.has("write");
  const [command, a, b, c, d] = words;
  const print = (value: unknown, text: string): CliResult => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : plain(text),
  });

  switch (command) {
    case "run": {
      const framework = options.get("framework");
      if (framework !== undefined && !["vitest", "jest", "node:test"].includes(String(framework)))
        return usageError("--framework must be vitest, jest, or node:test");
      const related = options.has("affected")
        ? await changedFiles(deps.root, deps.env, deps.run)
        : undefined;
      if (related !== undefined && related.length === 0) {
        return print(
          { ran: false, reason: "no changed files" },
          "No changed source or test files were found (git diff against HEAD), so nothing was run. Run without --affected for the whole suite.",
        );
      }
      const outcome = await runTests({
        root: deps.root,
        env: deps.env,
        ...(typeof framework === "string" ? { framework: framework as Framework } : {}),
        ...(related === undefined ? {} : { related }),
        coverage: options.has("coverage"),
        ...(deps.run === undefined ? {} : { run: deps.run }),
        ...(deps.now === undefined ? {} : { now: deps.now }),
      });
      if (!outcome.ok) {
        const text = [
          `Tests could not be run: ${outcome.code}`,
          outcome.message,
          ...(outcome.excerpt.length > 0
            ? ["", "Output (redacted):", ...outcome.excerpt.map((line) => `  ${line}`)]
            : []),
        ].join("\n");
        return print(outcome, text);
      }
      return print(outcome.report, renderTestReport(outcome.report));
    }

    case "coverage": {
      const { summary, reason } = readCoverage(resolve(deps.root, "coverage"));
      return summary === null
        ? print({ error: reason }, reason ?? "")
        : print(summary, renderCoverage(summary));
    }

    case "contracts": {
      if (a === "list") {
        const rows = KINDS.map((kind) => ({
          kind,
          variants: variantNames(kind),
          source: SOURCES[kind],
        }));
        return print(
          rows,
          rows
            .map(
              (row) =>
                `${row.kind.padEnd(20)} variants: ${row.variants.join(", ") || "-"}\n${"".padEnd(20)} ${row.source}`,
            )
            .join("\n"),
        );
      }
      if (a === "show" && b !== undefined) {
        if (!isKind(b))
          return usageError(`Unknown event kind "${b}". Choose one of: ${KINDS.join(", ")}.`);
        const variant = options.get("variant");
        const event = typeof variant === "string" ? fixture(b, variant) : baseEvent(b);
        if (event === null)
          return usageError(
            `Unknown variant "${String(variant)}" for ${b}. Available: ${variantNames(b).join(", ")}.`,
          );
        return { exitCode: 0, stdout: JSON.stringify(event, null, 2) };
      }
      if (a === "write" && b !== undefined) {
        if (!isKind(b)) return usageError(`Unknown event kind "${b}".`);
        const dir = options.get("dir");
        if (typeof dir !== "string") return usageError("contracts write needs --dir <directory>");
        const names = options.has("all") ? [undefined, ...variantNames(b)] : [undefined];
        const files = names.map((name) => ({
          path: `${dir.replace(/\/+$/, "")}/${b}${name === undefined ? "" : `.${name}`}.json`,
          content: `${JSON.stringify(name === undefined ? baseEvent(b) : fixture(b, name), null, 2)}\n`,
        }));
        if (!write)
          return print(
            { written: false, files: files.map((f) => f.path) },
            `These files would be created (add --write):\n${files.map((f) => `  ${f.path}`).join("\n")}`,
          );
        const outcome = writeFiles(deps.root, files);
        return print(
          outcome,
          [
            ...outcome.written.map((f) => `Created ${f}`),
            ...outcome.skipped.map((f) => `Skipped ${f} (it exists or is outside the project)`),
          ].join("\n"),
        );
      }
      if (a === "check" && b !== undefined && c !== undefined) {
        let response: unknown;
        let event: Record<string, unknown> | undefined;
        try {
          response = JSON.parse(c);
          event = d === undefined ? undefined : (JSON.parse(d) as Record<string, unknown>);
        } catch {
          return usageError("The response and the event must be valid JSON.");
        }
        const result =
          b === "sqs"
            ? validateSqsBatchResponse(response, event)
            : b === "apigw-http-v2" || b === "apigw-rest-v1"
              ? validateHttpResponse(response, b)
              : null;
        if (result === null)
          return usageError("check supports sqs, apigw-http-v2, and apigw-rest-v1.");
        return print(
          result,
          result.valid
            ? "The response has the expected shape."
            : `The response is not valid:\n${result.problems.map((p) => `  - ${p}`).join("\n")}`,
        );
      }
      return usageError(
        "use: contracts list | show <kind> | write <kind> --dir <dir> | check <kind> '<response>'",
      );
    }

    case "generate": {
      if (a === "cdk-assertions" && b !== undefined) {
        const cdkOut =
          typeof options.get("cdk-out") === "string" ? String(options.get("cdk-out")) : "cdk.out";
        const loaded = loadStacks(deps.root, cdkOut);
        const stack = loaded.stacks.find((candidate) => candidate.name === b);
        if (stack === undefined)
          return print(
            { error: "STACK_NOT_FOUND", problems: loaded.problems },
            `Stack ${b} was not found in ${cdkOut}. Found: ${loaded.stacks.map((s) => s.name).join(", ") || "none"}. Run \`cdk synth\` first.${loaded.problems.map((p) => `\n${p}`).join("")}`,
          );
        const target = isAbsolute(stack.file) ? stack.file : resolve(deps.root, stack.file);
        if (!isInside(deps.root, target)) return usageError("The template is outside the project.");
        const relativeTemplate = target.slice(deps.root.length).replace(/^[\\/]+/, "");
        const file = cdkAssertionsTest(
          b,
          relativeTemplate,
          stack.template,
          `test/${b}.assertions.test.ts`,
        );
        if ("error" in file) return usageError(file.error);
        if (!write)
          return print(
            { written: false, path: file.path },
            `Would create ${file.path} (add --write). It asserts policy on ${b}, read from ${relativeTemplate}:\n\n${file.content}`,
          );
        const outcome = writeFiles(deps.root, [file]);
        return print(
          outcome,
          [
            ...outcome.written.map(
              (f) => `Created ${f}. Run \`cdk synth\` before the tests so the template exists.`,
            ),
            ...outcome.skipped.map((f) => `Skipped ${f} (it exists or is outside the project)`),
          ].join("\n"),
        );
      }
      if (a === "handler" && b !== undefined && c !== undefined) {
        const base =
          b
            .replace(/\.[^./\\]+$/, "")
            .split(/[\\/]/)
            .pop() ?? "handler";
        const exportName =
          typeof options.get("export") === "string" ? String(options.get("export")) : "handler";
        const file = handlerTest(deps.root, b, c, `test/${base}.test.ts`, exportName);
        if ("error" in file) return usageError(file.error);
        if (!write)
          return print(
            { written: false, path: file.path },
            `Would create ${file.path} (add --write):\n\n${file.content}`,
          );
        const outcome = writeFiles(deps.root, [file]);
        return print(
          outcome,
          [
            ...outcome.written.map((f) => `Created ${f}`),
            ...outcome.skipped.map((f) => `Skipped ${f} (it exists or is outside the project)`),
          ].join("\n"),
        );
      }
      return usageError("use: generate cdk-assertions <stack> | generate handler <file> <kind>");
    }

    default:
      return { exitCode: 2, stdout: USAGE };
  }
}
