import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { inventory, rules } from "./rules.js";
import { checkClaims, FLOWS, looksLikeToken, VERIFY_CHECKLIST } from "./tokens.js";

export const runCli = defineCli({
  name: "aws-auth",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls: it creates, changes, or deletes no user, and it never reads or prints a token.",
  valued: ["issuer", "audience", "use", "scope", "group", "now"],
  commands: {
    inspect: {
      help: "[path]  User pools, app clients, and domains in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-auth",
          `${rows.length} identity resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared). No user data was read.`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Users, groups, federated providers set up in the console, and tokens in use are not visible in a template.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(11)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    "claims-check": {
      help: "<claims.json> --issuer <url> [--audience <client id>] [--use access|id] [--scope s] [--group g]  Check DECODED claims",
      run: (ctx) => {
        const file = ctx.words[0];
        const issuer = ctx.args.one("issuer");
        if (file === undefined || issuer === undefined)
          return ctx.fail("claims-check needs a claims file (decoded JSON) and --issuer", 2);
        const use = ctx.args.one("use");
        if (use !== undefined && use !== "access" && use !== "id")
          return ctx.fail("--use must be access or id", 2);
        const text = ctx.readText(file, 100_000);
        if (!text.ok) return ctx.fail(text.error);
        if (looksLikeToken(text.text))
          return ctx.fail(
            "That file contains something that looks like a JWT. Do not put tokens in files or in this tool: decode the claims yourself (or use a test fixture) and pass only the claims object. If this token is real, treat it as exposed and revoke it.",
          );
        let claims: unknown;
        try {
          claims = JSON.parse(text.text);
        } catch {
          return ctx.fail(`${file} is not valid JSON`);
        }
        const now =
          ctx.args.one("now") === undefined ? ctx.now : new Date(ctx.args.one("now") ?? "");
        if (Number.isNaN(now.getTime())) return ctx.fail("--now must be an ISO date and time", 2);
        const r = checkClaims(claims, {
          issuer,
          ...(ctx.args.one("audience") === undefined
            ? {}
            : { audience: ctx.args.one("audience") as string }),
          ...(use === undefined ? {} : { use }),
          ...(ctx.args.one("scope") === undefined
            ? {}
            : { scope: ctx.args.one("scope") as string }),
          ...(ctx.args.one("group") === undefined
            ? {}
            : { group: ctx.args.one("group") as string }),
          now,
        });
        return {
          exitCode: r.ok ? 0 : 1,
          stdout: ctx.json
            ? JSON.stringify(r, null, 2)
            : [
                r.ok
                  ? "The claims meet the expectations."
                  : "The claims do NOT meet the expectations:",
                ...r.problems.map((p) => `  - ${p}`),
                ...r.notes.map((n) => `Note: ${n}`),
              ].join("\n"),
        };
      },
    },
    flows: {
      help: `<${Object.keys(FLOWS).join("|")}>  Recommended sign-in flow, and the verification checklist`,
      run: (ctx) => {
        const key = ctx.words[0];
        if (key === undefined)
          return ctx.out(
            { apps: Object.keys(FLOWS), verify: VERIFY_CHECKLIST },
            `Application types: ${Object.keys(FLOWS).join(", ")}\n\nToken verification checklist:\n${VERIFY_CHECKLIST.map((c) => `- ${c}`).join("\n")}`,
          );
        const f = Object.hasOwn(FLOWS, key) ? FLOWS[key] : undefined;
        if (f === undefined) return ctx.fail(`unknown application type ${key}`, 2);
        return ctx.out(
          f,
          `${f.title}\nUse:\n${f.flow.map((x) => `- ${x}`).join("\n")}\nAvoid:\n${f.avoid.map((x) => `- ${x}`).join("\n")}\n\nToken verification checklist:\n${VERIFY_CHECKLIST.map((c) => `- ${c}`).join("\n")}\nSource: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-security-best-practices.html`,
        );
      },
    },
  },
});
