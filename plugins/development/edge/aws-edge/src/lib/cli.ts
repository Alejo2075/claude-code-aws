import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { lintFunction, reviewCachePolicy, STATUS_HINTS } from "./function.js";
import { inventory, rules } from "./rules.js";

export const runCli = defineCli({
  name: "aws-edge",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it changes no distribution, publishes no function, and creates no invalidation.",
  commands: {
    inspect: {
      help: "[path]  Distributions, origins, behaviors, edge functions in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-edge",
          `${rows.length} edge resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Cache hit ratio, origin latency, and the effect of an invalidation are run-time facts.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(13)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    function: {
      help: "<function.js>  Lint CloudFront Function source against the runtime's restrictions",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("function needs a JavaScript file", 2);
        const src = ctx.readText(file, 300_000);
        if (!src.ok) return ctx.fail(src.error);
        const issues = lintFunction(src.text);
        const errors = issues.filter((i) => i.level === "error").length;
        return {
          exitCode: errors > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(issues, null, 2)
            : issues.length === 0
              ? "No restriction violations found. The runtime is the authority: test the function with the CloudFront test tool (the user runs it) before publishing."
              : `${issues.map((i) => `${i.level.toUpperCase().padEnd(7)} line ${i.line}: ${i.message}`).join("\n")}\n${errors} error(s), ${issues.length - errors} warning(s).`,
        };
      },
    },
    cache: {
      help: "<cache-policy.json>  Review a cache policy for key bloat and TTL mistakes",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("cache needs a cache policy JSON file", 2);
        const json = ctx.readJson(file);
        if (!json.ok) return ctx.fail(json.error);
        const r = reviewCachePolicy(json.value);
        return ctx.out(
          r,
          r.length === 0
            ? "No findings in the cache policy."
            : r.map((x) => `[${x.severity}] ${x.message}`).join("\n"),
        );
      },
    },
    diagnose: {
      help: "<400|403|404|502|503|504>  Common causes of an HTTP status from CloudFront (hypotheses)",
      run: (ctx) => {
        const code = ctx.words[0];
        if (code === undefined)
          return ctx.out(
            Object.keys(STATUS_HINTS),
            `Codes: ${Object.keys(STATUS_HINTS).join(", ")}`,
          );
        const h = Object.hasOwn(STATUS_HINTS, code) ? STATUS_HINTS[code] : undefined;
        if (h === undefined) return ctx.fail(`no hints for ${code}`, 2);
        return ctx.out(
          h,
          `${h.title}: common causes (hypotheses, not a diagnosis)\n${h.causes.map((c) => `- ${c}`).join("\n")}\nCheck the X-Cache and x-amz-cf-id response headers, and the access logs for the request id. Invalidating the cache is rarely the fix for these and costs money after the free allowance: fix the cause first.`,
        );
      },
    },
  },
});
