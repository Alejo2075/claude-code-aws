import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import {
  resourcesOfType,
  type ResourceInfo,
  type Template,
} from "@claude-code-aws/template-analysis";

import { lintFunction } from "./function.js";

const PLUGIN = "aws-edge";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const txt = (v: unknown, fallback: string): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : fallback;
const refOf = (v: unknown): string => {
  const s = JSON.stringify(v ?? null);
  return s.match(/"Ref":"([^"]+)"/)?.[1] ?? s.match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ?? "";
};
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter(isRecord) : [];

export interface Row {
  kind: string;
  id: string;
  detail: string;
}

const config = (d: ResourceInfo): Record<string, unknown> =>
  isRecord(d.properties["DistributionConfig"]) ? d.properties["DistributionConfig"] : {};

export function inventory(stack: string, t: Template): Row[] {
  const rows: Row[] = [];
  for (const d of resourcesOfType(t, "AWS::CloudFront::Distribution")) {
    const c = config(d);
    const behaviors = 1 + list(c["CacheBehaviors"]).length;
    rows.push({
      kind: "distribution",
      id: `${stack}/${d.logicalId}`,
      detail: `${list(c["Origins"]).length} origin(s), ${behaviors} behavior(s), WAF ${c["WebACLId"] === undefined ? "none" : "attached"}`,
    });
  }
  for (const f of resourcesOfType(t, "AWS::CloudFront::Function"))
    rows.push({ kind: "function", id: `${stack}/${f.logicalId}`, detail: "CloudFront Function" });
  return rows;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const d of resourcesOfType(t, "AWS::CloudFront::Distribution")) {
    const id = at(d.logicalId);
    const c = config(d);
    const behaviors = [
      isRecord(c["DefaultCacheBehavior"]) ? c["DefaultCacheBehavior"] : {},
      ...list(c["CacheBehaviors"]),
    ];
    if (behaviors.some((b) => b["ViewerProtocolPolicy"] === "allow-all"))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EDG-VIEWER-HTTP",
          severity: "medium",
          title: "A behavior allows plain HTTP from viewers",
          explanation: "Viewers can fetch content, and send cookies, without encryption.",
          subject: id,
          resources: [id],
          recommendation: "Use redirect-to-https or https-only.",
        }),
      );
    const cert = c["ViewerCertificate"];
    if (
      isRecord(cert) &&
      typeof cert["MinimumProtocolVersion"] === "string" &&
      /^(SSLv3|TLSv1|TLSv1_2016|TLSv1\.1_2016)$/.test(cert["MinimumProtocolVersion"])
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EDG-OLD-TLS",
          severity: "high",
          title: `Minimum TLS version is ${cert["MinimumProtocolVersion"]}`,
          explanation: "Old protocol versions have known weaknesses.",
          subject: id,
          resources: [id],
          recommendation: "Use a TLSv1.2 security policy.",
        }),
      );
    for (const o of list(c["Origins"])) {
      const s3 = isRecord(o["S3OriginConfig"]) ? o["S3OriginConfig"] : null;
      const custom = isRecord(o["CustomOriginConfig"]) ? o["CustomOriginConfig"] : null;
      const oacSet = o["OriginAccessControlId"] !== undefined && o["OriginAccessControlId"] !== "";
      const oai =
        s3 !== null &&
        s3["OriginAccessIdentity"] !== undefined &&
        s3["OriginAccessIdentity"] !== "";
      if (s3 !== null && !oacSet && !oai)
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EDG-S3-NO-ORIGIN-ACCESS",
            severity: "high",
            title: "An S3 origin uses neither origin access control nor an identity",
            explanation:
              "CloudFront reaches the bucket anonymously, so the bucket must be public to work, and then it is reachable without CloudFront too.",
            subject: `${id}:${txt(o["Id"], "origin")}`,
            resources: [id],
            recommendation:
              "Use origin access control and a bucket policy that allows only this distribution.",
          }),
        );
      else if (s3 !== null && oai && !oacSet)
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EDG-S3-LEGACY-OAI",
            severity: "info",
            title: "An S3 origin uses the legacy origin access identity",
            explanation:
              "Origin access control is the current mechanism and supports more cases (such as SSE-KMS buckets).",
            subject: `${id}:${txt(o["Id"], "origin")}`,
            resources: [id],
          }),
        );
      if (custom !== null && custom["OriginProtocolPolicy"] === "http-only")
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EDG-ORIGIN-HTTP",
            severity: "medium",
            title: "CloudFront talks to a custom origin over plain HTTP",
            explanation:
              "Traffic between CloudFront and the origin crosses the network unencrypted.",
            subject: `${id}:${txt(o["Id"], "origin")}`,
            resources: [id],
            recommendation: "Use https-only and a certificate on the origin.",
          }),
        );
    }
    if (c["WebACLId"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EDG-NO-WAF",
          severity: "info",
          title: "No web ACL is attached",
          explanation:
            "Common web attacks and abusive clients are not filtered at the edge. Whether you need it depends on the application.",
          subject: id,
          resources: [id],
        }),
      );
    if (c["Logging"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EDG-NO-LOGGING",
          severity: "low",
          title: "Access logging is off",
          explanation: "Requests cannot be investigated after the fact.",
          subject: id,
          resources: [id],
        }),
      );
    for (const b of behaviors)
      for (const a of list(b["LambdaFunctionAssociations"])) {
        const target = t.resources[refOf(a["LambdaFunctionARN"])];
        if (target?.type === "AWS::Lambda::Function")
          out.push(
            staticFinding(PLUGIN, {
              ruleId: "EDG-EDGE-NOT-VERSION",
              severity: "high",
              title: "A Lambda@Edge association points at a function, not a numbered version",
              explanation:
                "Lambda@Edge needs a numbered version (not $LATEST or an alias), and the function must be in us-east-1.",
              subject: `${id}:${target.logicalId}`,
              resources: [id, at(target.logicalId)],
            }),
          );
      }
  }
  for (const fn of resourcesOfType(t, "AWS::Lambda::Function")) {
    const used = resourcesOfType(t, "AWS::CloudFront::Distribution").some((d) =>
      JSON.stringify(d.properties).includes(fn.logicalId),
    );
    if (!used) continue;
    const bad: string[] = [];
    if (isRecord(fn.properties["VpcConfig"])) bad.push("a VPC");
    if (isRecord(fn.properties["Environment"])) bad.push("environment variables");
    if (Array.isArray(fn.properties["Layers"]) && fn.properties["Layers"].length > 0)
      bad.push("layers");
    if (
      Array.isArray(fn.properties["Architectures"]) &&
      fn.properties["Architectures"].includes("arm64")
    )
      bad.push("arm64");
    if (isRecord(fn.properties["DeadLetterConfig"])) bad.push("a dead-letter queue");
    if (
      isRecord(fn.properties["TracingConfig"]) &&
      fn.properties["TracingConfig"]["Mode"] === "Active"
    )
      bad.push("X-Ray tracing");
    if (bad.length > 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EDG-EDGE-UNSUPPORTED-FEATURE",
          severity: "high",
          title: `Lambda@Edge function uses ${bad.join(", ")}`,
          explanation:
            "Lambda@Edge does not support these features (see Restrictions on Lambda@Edge).",
          subject: at(fn.logicalId),
          resources: [at(fn.logicalId)],
        }),
      );
  }
  for (const f of resourcesOfType(t, "AWS::CloudFront::Function")) {
    const code = f.properties["FunctionCode"];
    if (typeof code === "string")
      for (const issue of lintFunction(code))
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EDG-FUNCTION-CODE",
            severity: issue.level === "error" ? "high" : "low",
            title: issue.message,
            explanation:
              "Found by linting the inline CloudFront Function code against the runtime restrictions.",
            subject: `${at(f.logicalId)}:${issue.message}`,
            resources: [at(f.logicalId)],
          }),
        );
  }
  return out;
}
