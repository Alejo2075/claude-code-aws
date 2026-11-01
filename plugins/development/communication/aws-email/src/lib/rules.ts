import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-email";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown, fallback: string): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : fallback;
const ref = (v: unknown): string => {
  const s = JSON.stringify(v ?? null);
  return s.match(/"Ref":"([^"]+)"/)?.[1] ?? s.match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ?? "";
};

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const i of resourcesOfType(t, "AWS::SES::EmailIdentity"))
    rows.push({
      kind: "identity",
      id: `${stack}/${i.logicalId}`,
      detail: txt(i.properties["EmailIdentity"], "(from template)"),
    });
  for (const c of resourcesOfType(t, "AWS::SES::ConfigurationSet"))
    rows.push({
      kind: "config-set",
      id: `${stack}/${c.logicalId}`,
      detail: `reputation metrics ${isRecord(c.properties["ReputationOptions"]) && c.properties["ReputationOptions"]["ReputationMetricsEnabled"] === true ? "on" : "off"}`,
    });
  for (const d of resourcesOfType(t, "AWS::SES::ConfigurationSetEventDestination"))
    rows.push({
      kind: "event-dest",
      id: `${stack}/${d.logicalId}`,
      detail:
        isRecord(d.properties["EventDestination"]) &&
        Array.isArray(d.properties["EventDestination"]["MatchingEventTypes"])
          ? d.properties["EventDestination"]["MatchingEventTypes"].join(", ")
          : "?",
    });
  for (const r of resourcesOfType(t, "AWS::SES::ReceiptRule"))
    rows.push({
      kind: "receipt-rule",
      id: `${stack}/${r.logicalId}`,
      detail: `${isRecord(r.properties["Rule"]) && Array.isArray(r.properties["Rule"]["Actions"]) ? r.properties["Rule"]["Actions"].length : 0} action(s)`,
    });
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const i of resourcesOfType(t, "AWS::SES::EmailIdentity")) {
    const name = txt(i.properties["EmailIdentity"], "");
    const isDomain = name !== "" && !name.includes("@");
    if (
      isDomain &&
      !(isRecord(i.properties["DkimAttributes"]) || isRecord(i.properties["DkimSigningAttributes"]))
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EML-NO-DKIM",
          severity: "medium",
          status: "hypothesis",
          title: `Domain identity ${name} sets no DKIM attributes`,
          explanation:
            "Easy DKIM is the default for new domain identities, but the template does not say so. Without DKIM, mail from the domain is easier to spoof and more likely to be filtered.",
          subject: at(i.logicalId),
          resources: [at(i.logicalId)],
          recommendation:
            "Set DkimSigningAttributes (or Easy DKIM) and publish the DNS records. Add SPF and a DMARC policy at your DNS provider.",
        }),
      );
    if (i.properties["ConfigurationSetAttributes"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EML-IDENTITY-NO-CONFIG-SET",
          severity: "low",
          title: `Identity ${name || i.logicalId} has no default configuration set`,
          explanation:
            "Without a configuration set, bounces and complaints from this identity produce no events your application can react to.",
          subject: at(i.logicalId),
          resources: [at(i.logicalId)],
        }),
      );
  }
  const dests = resourcesOfType(t, "AWS::SES::ConfigurationSetEventDestination");
  for (const c of resourcesOfType(t, "AWS::SES::ConfigurationSet")) {
    const mine = dests.filter((d) => ref(d.properties["ConfigurationSetName"]) === c.logicalId);
    const events = new Set(
      mine.flatMap((d) =>
        isRecord(d.properties["EventDestination"]) &&
        Array.isArray(d.properties["EventDestination"]["MatchingEventTypes"])
          ? (d.properties["EventDestination"]["MatchingEventTypes"] as string[])
          : [],
      ),
    );
    if (!events.has("bounce") || !events.has("complaint"))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EML-NO-BOUNCE-COMPLAINT-EVENTS",
          severity: "medium",
          title: `Configuration set ${c.logicalId} does not publish bounce and complaint events`,
          explanation:
            "Nothing in your system learns that an address bounced or a recipient complained, so you keep mailing them and the rates climb toward SES's review thresholds.",
          subject: at(c.logicalId),
          resources: [at(c.logicalId)],
          recommendation:
            "Add an event destination (SNS, EventBridge, or Firehose) for bounce and complaint, and suppress those addresses.",
        }),
      );
    const rep = c.properties["ReputationOptions"];
    if (!(isRecord(rep) && rep["ReputationMetricsEnabled"] === true))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EML-NO-REPUTATION-METRICS",
          severity: "low",
          title: `Configuration set ${c.logicalId} has reputation metrics off`,
          explanation:
            "Per-set bounce and complaint rates are not published to CloudWatch, so you cannot alarm on them.",
          subject: at(c.logicalId),
          resources: [at(c.logicalId)],
        }),
      );
  }
  for (const r of resourcesOfType(t, "AWS::SES::ReceiptRule")) {
    const rule = r.properties["Rule"];
    if (isRecord(rule) && rule["ScanEnabled"] !== true)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EML-RECEIPT-NO-SCAN",
          severity: "low",
          title: `Receipt rule ${r.logicalId} does not scan for spam and viruses`,
          explanation: "Inbound mail reaches your action unscanned.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)],
        }),
      );
    if (
      isRecord(rule) &&
      Array.isArray(rule["Actions"]) &&
      rule["Actions"].some(
        (a) => isRecord(a) && isRecord(a["S3Action"]) && a["S3Action"]["KmsKeyArn"] === undefined,
      )
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EML-RECEIPT-S3-NO-KMS",
          severity: "low",
          title: `Receipt rule ${r.logicalId} stores mail in S3 without a KMS key`,
          explanation: "Stored messages are personal data; encrypt them with a key you control.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)],
        }),
      );
  }
  return out;
}
