import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-config";
const SECRET_NAME = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i;
const txt = (v: unknown, fallback: string): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : fallback;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const a of resourcesOfType(t, "AWS::AppConfig::Application"))
    rows.push({
      kind: "application",
      id: `${stack}/${a.logicalId}`,
      detail: typeof a.properties["Name"] === "string" ? a.properties["Name"] : "",
    });
  for (const e of resourcesOfType(t, "AWS::AppConfig::Environment"))
    rows.push({
      kind: "environment",
      id: `${stack}/${e.logicalId}`,
      detail: `${Array.isArray(e.properties["Monitors"]) ? e.properties["Monitors"].length : 0} alarm monitor(s)`,
    });
  for (const p of resourcesOfType(t, "AWS::AppConfig::ConfigurationProfile"))
    rows.push({
      kind: "profile",
      id: `${stack}/${p.logicalId}`,
      detail: `${typeof p.properties["Type"] === "string" ? p.properties["Type"] : "free-form"}, ${Array.isArray(p.properties["Validators"]) ? p.properties["Validators"].length : 0} validator(s)`,
    });
  for (const d of resourcesOfType(t, "AWS::AppConfig::DeploymentStrategy"))
    rows.push({
      kind: "strategy",
      id: `${stack}/${d.logicalId}`,
      detail: `${txt(d.properties["GrowthType"], "LINEAR")} ${txt(d.properties["GrowthFactor"], "?")}% over ${txt(d.properties["DeploymentDurationInMinutes"], "?")} min, bake ${txt(d.properties["FinalBakeTimeInMinutes"], "0")} min`,
    });
  for (const p of resourcesOfType(t, "AWS::SSM::Parameter"))
    rows.push({
      kind: "parameter",
      id: `${stack}/${p.logicalId}`,
      detail: `${typeof p.properties["Type"] === "string" ? p.properties["Type"] : "String"}, name ${typeof p.properties["Name"] === "string" ? p.properties["Name"] : "(from template)"} (value not shown)`,
    });
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const e of resourcesOfType(t, "AWS::AppConfig::Environment"))
    if (!Array.isArray(e.properties["Monitors"]) || e.properties["Monitors"].length === 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CFG-ENV-NO-MONITORS",
          severity: "medium",
          title: "Environment has no alarm monitors",
          explanation:
            "Without CloudWatch alarms attached, AppConfig cannot roll a bad configuration back automatically.",
          subject: at(e.logicalId),
          resources: [at(e.logicalId)],
          recommendation: "Add Monitors with the alarms that show the application is unhealthy.",
        }),
      );
  for (const d of resourcesOfType(t, "AWS::AppConfig::DeploymentStrategy")) {
    if (d.properties["DeploymentDurationInMinutes"] === 0 || d.properties["GrowthFactor"] === 100)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CFG-STRATEGY-ALL-AT-ONCE",
          severity: "medium",
          title: "Strategy deploys to every target at once",
          explanation: "A bad value reaches all callers immediately.",
          subject: at(d.logicalId),
          resources: [at(d.logicalId)],
          recommendation:
            "Use a gradual strategy with a bake time for anything that affects production behavior.",
        }),
      );
    if (!(
      typeof d.properties["FinalBakeTimeInMinutes"] === "number" &&
      d.properties["FinalBakeTimeInMinutes"] > 0
    ))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CFG-STRATEGY-NO-BAKE",
          severity: "low",
          title: "Strategy has no bake time",
          explanation:
            "Alarms are not watched after the rollout reaches 100%, so a late failure is not rolled back.",
          subject: at(d.logicalId),
          resources: [at(d.logicalId)],
        }),
      );
  }
  for (const p of resourcesOfType(t, "AWS::AppConfig::ConfigurationProfile"))
    if (!Array.isArray(p.properties["Validators"]) || p.properties["Validators"].length === 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CFG-PROFILE-NO-VALIDATOR",
          severity: "low",
          title: "Profile has no validator",
          explanation:
            "A malformed or out-of-range value can be deployed. Add a JSON Schema validator or a validation Lambda.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
        }),
      );
  for (const p of resourcesOfType(t, "AWS::SSM::Parameter")) {
    const name = typeof p.properties["Name"] === "string" ? p.properties["Name"] : p.logicalId;
    const value = p.properties["Value"];
    if (SECRET_NAME.test(name) && !(isRecord(value) && Object.keys(value).length > 0))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "CFG-PARAMETER-LOOKS-SECRET",
          severity: "high",
          title: `Parameter ${name} looks like a secret stored as plain configuration`,
          explanation:
            "Parameter Store here is for non-secret settings. Secrets belong in Secrets Manager or an encrypted parameter created outside the template, so the value is not in the template and its history.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
          recommendation:
            "Move it to Secrets Manager and store only its name. Secret handling is owned by aws-security.",
        }),
      );
  }
  return out;
}
