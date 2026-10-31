const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface TemplateIssue {
  level: "error" | "warning";
  message: string;
}

export interface TemplateReport {
  variables: string[];
  issues: TemplateIssue[];
}

const VAR = /\{\{\s*([#/^]?[A-Za-z_][\w.]*)\s*\}\}/g;

/** Checks an SES template ({Template:{...}} or the bare object) and, when data is given, that every variable has a value. */
export function checkTemplate(doc: unknown, data?: unknown): TemplateReport {
  const issues: TemplateIssue[] = [];
  const t = isObj(doc) && isObj(doc["Template"]) ? doc["Template"] : doc;
  if (!isObj(t))
    return {
      variables: [],
      issues: [
        {
          level: "error",
          message: "the template must be an object with SubjectPart and HtmlPart or TextPart",
        },
      ],
    };
  const subject = typeof t["SubjectPart"] === "string" ? t["SubjectPart"] : "";
  const html = typeof t["HtmlPart"] === "string" ? t["HtmlPart"] : "";
  const text = typeof t["TextPart"] === "string" ? t["TextPart"] : "";
  if (subject === "") issues.push({ level: "error", message: "SubjectPart is missing" });
  if (html === "" && text === "")
    issues.push({ level: "error", message: "the template needs HtmlPart or TextPart" });
  if (html !== "" && text === "")
    issues.push({
      level: "warning",
      message:
        "there is an HtmlPart but no TextPart; clients and filters that prefer plain text get nothing, and a text alternative helps deliverability",
    });
  const all = `${subject}\n${html}\n${text}`;
  const open = (all.match(/\{\{/g) ?? []).length;
  const close = (all.match(/\}\}/g) ?? []).length;
  if (open !== close)
    issues.push({ level: "error", message: `unbalanced braces: ${open} "{{" and ${close} "}}"` });
  const names = new Set<string>();
  const sections: string[] = [];
  for (const m of all.matchAll(VAR)) {
    const raw = m[1] ?? "";
    if (raw.startsWith("#") || raw.startsWith("^")) sections.push(raw.slice(1));
    else if (raw.startsWith("/")) {
      if (sections.pop() !== raw.slice(1))
        issues.push({
          level: "error",
          message: `the section {{${raw}}} closes a section that is not open`,
        });
    } else names.add(raw);
  }
  if (sections.length > 0)
    issues.push({ level: "error", message: `section ${sections.join(", ")} is never closed` });
  if (!/unsubscribe/i.test(all))
    issues.push({
      level: "warning",
      message:
        "no mention of unsubscribing. Marketing and bulk mail needs a working unsubscribe mechanism (and the List-Unsubscribe header); transactional mail does not, but say so deliberately",
    });
  if (/<script\b/i.test(html))
    issues.push({
      level: "warning",
      message:
        "the HTML contains a script tag; mail clients remove or block scripts and filters penalize them",
    });
  if (/\bhttp:\/\//i.test(html))
    issues.push({ level: "warning", message: "the HTML links to http:// addresses; use https" });
  if (data !== undefined) {
    const d = isObj(data) ? data : {};
    for (const n of names) {
      const first = n.split(".")[0] ?? n;
      if (!(first in d))
        issues.push({
          level: "error",
          message: `the variable {{${n}}} has no value in the data; it would render empty`,
        });
    }
    const used = new Set([...names].map((n) => n.split(".")[0]));
    for (const k of Object.keys(d))
      if (
        !used.has(k) &&
        !sections.includes(k) &&
        !all.includes(`{{#${k}}}`) &&
        !all.includes(`{{^${k}}}`)
      )
        issues.push({
          level: "warning",
          message: `the data key "${k}" is not used by the template`,
        });
  }
  return { variables: [...names].sort(), issues };
}

const ADDRESS =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const SIMULATOR = new Set([
  "success@simulator.amazonses.com",
  "bounce@simulator.amazonses.com",
  "complaint@simulator.amazonses.com",
  "ooto@simulator.amazonses.com",
  "suppressionlist@simulator.amazonses.com",
]);

export interface DryRun {
  valid: string[];
  invalid: string[];
  duplicates: string[];
  simulator: string[];
  warnings: string[];
}

/** Validates the shape of recipient addresses. Nothing is sent and no identity or sandbox status is checked. */
export function dryRun(recipients: readonly string[]): DryRun {
  const seen = new Set<string>();
  const out: DryRun = { valid: [], invalid: [], duplicates: [], simulator: [], warnings: [] };
  for (const raw of recipients) {
    const a = raw.trim();
    if (a === "") continue;
    const key = a.toLowerCase();
    if (!ADDRESS.test(a) || a.length > 254) out.invalid.push(a);
    else if (seen.has(key)) out.duplicates.push(a);
    else {
      seen.add(key);
      out.valid.push(a);
      if (SIMULATOR.has(key)) out.simulator.push(a);
    }
  }
  if (out.valid.length > out.simulator.length)
    out.warnings.push(
      "Real addresses are in the list. In the SES sandbox every recipient must be verified; outside it, each message to a real person counts toward your reputation. Test with the SES mailbox simulator addresses first.",
    );
  if (out.valid.length > 50)
    out.warnings.push(
      "This is a large recipient list for one message. Check the per-message recipient limit on the SES quotas page, and send in batches.",
    );
  return out;
}

export interface Rates {
  sent: number;
  bounces: number;
  complaints: number;
}

export interface Verdict {
  bounceRate: number;
  complaintRate: number;
  bounce: "ok" | "review" | "pause-risk";
  complaint: "ok" | "above-target";
  notes: string[];
}

/** Thresholds from the SES documentation: a bounce rate of 5% or more puts an account under review, 10% or more may pause sending; keep the complaint rate below 0.1%. */
export function judgeRates(r: Rates): Verdict {
  const bounceRate = r.sent === 0 ? 0 : (r.bounces / r.sent) * 100;
  const complaintRate = r.sent === 0 ? 0 : (r.complaints / r.sent) * 100;
  const notes = [
    "SES calculates these rates over a representative volume of mail rather than a fixed window, so a small sample can mislead.",
    "These are the documented thresholds for account review; keeping well below them is the goal, not staying just under.",
  ];
  if (r.sent < 1000) notes.push("Fewer than 1,000 messages: one bounce moves the rate a lot.");
  return {
    bounceRate: Math.round(bounceRate * 100) / 100,
    complaintRate: Math.round(complaintRate * 1000) / 1000,
    bounce: bounceRate >= 10 ? "pause-risk" : bounceRate >= 5 ? "review" : "ok",
    complaint: complaintRate >= 0.1 ? "above-target" : "ok",
    notes,
  };
}

export interface DnsReport {
  spf: string[];
  dkim: string[];
  dmarc: string[];
}

/** Syntax checks of TXT record strings you copy from DNS. It does not query DNS. */
export function checkDns(records: {
  spf?: string;
  dmarc?: string;
  dkimCnames?: string[];
}): DnsReport {
  const spf: string[] = [];
  const dmarc: string[] = [];
  const dkim: string[] = [];
  if (records.spf !== undefined) {
    const s = records.spf.trim();
    if (!/^v=spf1\b/.test(s)) spf.push("An SPF record must start with v=spf1.");
    if (!/\binclude:amazonses\.com\b/.test(s) && !/\bredirect=/.test(s))
      spf.push(
        "It does not include amazonses.com. That matters only if you use a custom MAIL FROM domain or send through SES under this domain's SPF.",
      );
    if (!/[~-]all\b/.test(s))
      spf.push("It does not end in ~all or -all, so unlisted senders are not restricted.");
    if ((s.match(/\binclude:|\ba\b|\bmx\b|\bptr\b|exists:|redirect=/g) ?? []).length > 10)
      spf.push("SPF allows 10 DNS lookups; this record may exceed it.");
  }
  if (records.dmarc !== undefined) {
    const d = records.dmarc.trim();
    if (!/^v=DMARC1\b/i.test(d)) dmarc.push("A DMARC record must start with v=DMARC1.");
    const p = /\bp=(none|quarantine|reject)\b/i.exec(d)?.[1]?.toLowerCase();
    if (p === undefined) dmarc.push("No valid p= policy (none, quarantine, or reject).");
    else if (p === "none")
      dmarc.push(
        "p=none only monitors. Move to quarantine or reject once reports show your legitimate mail passes.",
      );
    if (!/\brua=mailto:/i.test(d))
      dmarc.push("No rua= address, so you will not receive aggregate reports.");
  }
  if (records.dkimCnames !== undefined) {
    if (records.dkimCnames.length !== 3)
      dkim.push(
        `Easy DKIM publishes three CNAME records; ${records.dkimCnames.length} were given.`,
      );
    for (const c of records.dkimCnames)
      if (!/\._domainkey\./.test(c) || !/dkim\.amazonses\.com\.?$/.test(c))
        dkim.push(
          `"${c.slice(0, 80)}" does not look like an SES DKIM record (selector._domainkey ... dkim.amazonses.com).`,
        );
  }
  return { spf, dkim, dmarc };
}
