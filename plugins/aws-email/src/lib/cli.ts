import {
  defineCli,
  eachStack,
  localReport,
  noTemplates,
  reportResult,
  TEMPLATE_LIMITATION,
} from "@claude-code-aws/plugin-kit";

import { inventory, rules } from "./rules.js";
import { checkDns, checkTemplate, dryRun, judgeRates } from "./tools.js";

export const runCli = defineCli({
  name: "aws-email",
  promise:
    "Reads files inside the project. Writes nothing. No AWS calls and no mail: nothing is sent, verified, or published.",
  valued: ["data", "to", "sent", "bounces", "complaints", "spf", "dmarc", "dkim"],
  commands: {
    inspect: {
      help: "[path]  SES identities, configuration sets, and receipt rules in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-email",
          `${rows.length} SES resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Verification status, the sandbox, sending quotas, and suppression lists are account settings that a template does not show.",
          ],
          ctx.now,
        );
        return reportResult(ctx, report, [
          `Resources:\n${rows.map((r) => `  ${r.kind.padEnd(13)} ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems,
        ]);
      },
    },
    "template-check": {
      help: "<template.json> [--data data.json]  Validate an SES template and its variables",
      run: (ctx) => {
        const file = ctx.words[0];
        if (file === undefined)
          return ctx.fail("template-check needs an SES template JSON file", 2);
        const doc = ctx.readJson(file, 600_000);
        if (!doc.ok) return ctx.fail(doc.error);
        const dataFile = ctx.args.one("data");
        let data: unknown;
        if (dataFile !== undefined) {
          const d = ctx.readJson(dataFile, 600_000);
          if (!d.ok) return ctx.fail(d.error);
          data = d.value;
        }
        const r = checkTemplate(doc.value, data);
        const errors = r.issues.filter((i) => i.level === "error").length;
        return {
          exitCode: errors > 0 ? 1 : 0,
          stdout: ctx.json
            ? JSON.stringify(r, null, 2)
            : [
                `Variables: ${r.variables.join(", ") || "none"}`,
                ...r.issues.map((i) => `${i.level.toUpperCase().padEnd(7)} ${i.message}`),
                r.issues.length === 0
                  ? "No problems found. Nothing was sent; render the template with test data in a sandbox before using it."
                  : `${errors} error(s), ${r.issues.length - errors} warning(s).`,
              ].join("\n"),
        };
      },
    },
    "dry-run": {
      help: "--to a@x.com,b@y.com  Validate recipient addresses without sending",
      run: (ctx) => {
        const to = ctx.args.one("to");
        if (to === undefined)
          return ctx.fail("dry-run needs --to with a comma-separated list of addresses", 2);
        const r = dryRun(to.split(","));
        const text = [
          `NOT SENT. ${r.valid.length} valid, ${r.invalid.length} invalid, ${r.duplicates.length} duplicate.`,
          ...r.invalid.map((a) => `  invalid: ${a}`),
          ...r.duplicates.map((a) => `  duplicate: ${a}`),
          ...(r.simulator.length === 0
            ? []
            : [
                `  SES mailbox simulator addresses: ${r.simulator.join(", ")} (safe for tests; they do not count against your reputation)`,
              ]),
          ...r.warnings.map((w) => `Warning: ${w}`),
          "Sending real mail needs the recipient list, the sender identity, and the volume approved by the person who owns the account.",
        ].join("\n");
        return {
          exitCode: r.invalid.length > 0 ? 1 : 0,
          stdout: ctx.json ? JSON.stringify(r, null, 2) : text,
        };
      },
    },
    deliverability: {
      help: "--sent n --bounces n --complaints n [--spf '<txt>'] [--dmarc '<txt>'] [--dkim <cname>]...  Judge rates and check DNS record syntax",
      run: (ctx) => {
        const sent = ctx.args.num("sent", Number.NaN);
        const bounces = ctx.args.num("bounces", Number.NaN);
        const complaints = ctx.args.num("complaints", Number.NaN);
        const spf = ctx.args.one("spf");
        const dmarc = ctx.args.one("dmarc");
        const dkim = ctx.args.options.get("dkim");
        const haveRates = [sent, bounces, complaints].every((n) => Number.isFinite(n) && n >= 0);
        if (!haveRates && spf === undefined && dmarc === undefined && dkim === undefined)
          return ctx.fail(
            "deliverability needs --sent --bounces --complaints (numbers from your SES reputation metrics), and/or DNS records to check",
            2,
          );
        const lines: string[] = [];
        const value: Record<string, unknown> = {};
        if (haveRates) {
          const v = judgeRates({ sent, bounces, complaints });
          value["rates"] = v;
          lines.push(
            `Bounce rate ${v.bounceRate}% (${v.bounce}); complaint rate ${v.complaintRate}% (${v.complaint}).`,
            "Documented thresholds: a bounce rate of 5% or more puts an account under review, 10% or more may pause sending; keep complaints below 0.1%.",
            ...v.notes.map((n) => `- ${n}`),
          );
        }
        if (spf !== undefined || dmarc !== undefined || dkim !== undefined) {
          const d = checkDns({
            ...(spf === undefined ? {} : { spf }),
            ...(dmarc === undefined ? {} : { dmarc }),
            ...(dkim === undefined ? {} : { dkimCnames: dkim }),
          });
          value["dns"] = d;
          lines.push(
            ...d.spf.map((x) => `SPF: ${x}`),
            ...d.dkim.map((x) => `DKIM: ${x}`),
            ...d.dmarc.map((x) => `DMARC: ${x}`),
            "DNS checks are syntax checks of the strings you give; this tool does not query DNS.",
          );
        }
        return ctx.out(value, lines.join("\n"));
      },
    },
  },
});
