import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import {
  compareContract,
  contractRoutes,
  parseSpec,
  testPlan,
  validateOpenApi,
} from "./openapi.js";
import { routesOf, rules } from "./routes.js";

const BASE = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~/-]*)?$/;

export const runCli = defineCli({
  name: "aws-api",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls and no HTTP requests: test commands are printed for you to run.",
  valued: ["base-url", "contract"],
  commands: {
    inspect: {
      help: "[path]  APIs, routes, authorizers, CORS, and stages in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const routes = eachStack(stacks, (s) => routesOf(s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-api",
          `${routes.length} route(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Custom domains, WAF, and stage variables set outside the template are not visible.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Routes:\n${routes.map((r) => `  ${r.kind.padEnd(9)} ${r.method.padEnd(7)} ${r.path.padEnd(32)} ${r.authorization}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    routes: {
      help: "[path]  The route table with authorization",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const routes = eachStack(stacks, (s) => routesOf(s.template));
        return ctx.out(
          routes,
          routes
            .map(
              (r) =>
                `${r.kind.padEnd(9)} ${r.method.padEnd(7)} ${r.path.padEnd(32)} ${r.authorization}`,
            )
            .join("\n") || "No routes found.",
        );
      },
    },
    validate: {
      help: "<openapi.json|yaml>  Check an OpenAPI 3 contract",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("validate needs an OpenAPI file", 2);
        const text = ctx.readText(file);
        if (!text.ok) return ctx.fail(text.error);
        const spec = parseSpec(text.text);
        if (!spec.ok) return ctx.fail(spec.error);
        const issues = validateOpenApi(spec.value);
        const errors = issues.filter((i) => i.level === "error").length;
        return {
          exitCode: errors > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(issues, null, 2)
            : issues.length === 0
              ? "Valid: no problems found (local references only; external references are not followed)."
              : `${issues.map((i) => `${i.level.toUpperCase().padEnd(7)} ${i.path} ${i.message}`).join("\n")}\n${errors} error(s), ${issues.length - errors} warning(s).`,
        };
      },
    },
    "contract-diff": {
      help: "<openapi> [cdk.out]  Routes in the contract versus routes declared in the templates",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined) return ctx.fail("contract-diff needs an OpenAPI file", 2);
        const text = ctx.readText(file);
        if (!text.ok) return ctx.fail(text.error);
        const spec = parseSpec(text.text);
        if (!spec.ok) return ctx.fail(spec.error);
        const { stacks, problems } = ctx.stacks(ctx.words[1]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[1]);
        const d = compareContract(
          contractRoutes(spec.value),
          eachStack(stacks, (s) => routesOf(s.template)),
        );
        const lines = [
          `${d.matched} route(s) match.`,
          ...d.missing.map((m) => `  in the contract, not declared in the templates: ${m}`),
          ...d.extra.map((m) => `  declared in the templates, not in the contract: ${m}`),
          "Parameter names are ignored when matching. This compares the contract with what the templates declare, not with the deployed API.",
        ];
        return {
          exitCode: d.missing.length + d.extra.length > 0 ? 1 : 0,
          stdout: ctx.json ? JSON.stringify(d, null, 2) : lines.join("\n"),
        };
      },
    },
    "test-plan": {
      help: "<openapi> --base-url <url>  Read-only requests as curl commands (never sent); writes listed for approval",
      run: (ctx) => {
        const file = ctx.words[0];
        const base = ctx.args.one("base-url");
        if (file === undefined || base === undefined || !BASE.test(base))
          return ctx.fail(
            "test-plan needs an OpenAPI file and --base-url such as https://api.example.com/prod",
            2,
          );
        const text = ctx.readText(file);
        if (!text.ok) return ctx.fail(text.error);
        const spec = parseSpec(text.text);
        if (!spec.ok) return ctx.fail(spec.error);
        const plan = testPlan(spec.value, base);
        return ctx.out(
          plan,
          [
            "NOT SENT. Read-only requests (set TOKEN in your shell; it is never written here):",
            ...plan.safe.map((c) => `  ${c}`),
            "",
            "Operations that change data (run only against a test environment you own, with a body you wrote):",
            ...plan.needsApproval.map((c) => `  ${c}`),
            "",
            "Confirm the target is the stage you mean: a stage name in a URL is the usual way to hit production by mistake.",
          ].join("\n"),
        );
      },
    },
  },
});
