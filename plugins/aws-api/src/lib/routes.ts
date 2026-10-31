import { staticFinding } from "@claude-code-aws/plugin-kit";
import type { Finding } from "@claude-code-aws/report-contract";
import { resourcesOfType, type Template } from "@claude-code-aws/template-analysis";

const PLUGIN = "aws-api";
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const ref = (v: unknown): string => {
  const s = JSON.stringify(v ?? null);
  return s.match(/"Ref":"([^"]+)"/)?.[1] ?? s.match(/"Fn::GetAtt":\["([^"]+)"/)?.[1] ?? "";
};

export interface Route {
  api: string;
  kind: "http" | "rest" | "websocket";
  method: string;
  path: string;
  authorization: string;
}

function restPath(t: Template, id: string, depth = 0): string {
  const r = t.resources[id];
  if (r?.type !== "AWS::ApiGateway::Resource" || depth > 20) return "";
  const part = typeof r.properties["PathPart"] === "string" ? r.properties["PathPart"] : "{...}";
  return `${restPath(t, ref(r.properties["ParentId"]), depth + 1)}/${part}`;
}

export function routesOf(t: Template): Route[] {
  const out: Route[] = [];
  for (const r of resourcesOfType(t, "AWS::ApiGatewayV2::Route")) {
    const api = t.resources[ref(r.properties["ApiId"])];
    const key = typeof r.properties["RouteKey"] === "string" ? r.properties["RouteKey"] : "?";
    const ws = api?.properties["ProtocolType"] === "WEBSOCKET";
    const [method, ...rest] = key.split(" ");
    out.push({
      api: ref(r.properties["ApiId"]),
      kind: ws ? "websocket" : "http",
      method: ws ? "WS" : (method ?? "ANY"),
      path: ws ? key : rest.join(" ") || key,
      authorization:
        typeof r.properties["AuthorizationType"] === "string"
          ? r.properties["AuthorizationType"]
          : "NONE",
    });
  }
  for (const m of resourcesOfType(t, "AWS::ApiGateway::Method")) {
    out.push({
      api: ref(m.properties["RestApiId"]),
      kind: "rest",
      method: typeof m.properties["HttpMethod"] === "string" ? m.properties["HttpMethod"] : "?",
      path: restPath(t, ref(m.properties["ResourceId"])) || "/",
      authorization:
        typeof m.properties["AuthorizationType"] === "string"
          ? m.properties["AuthorizationType"]
          : "NONE",
    });
  }
  return out;
}

export function rules(stack: string, t: Template): Finding[] {
  const out: Finding[] = [];
  const at = (id: string): string => `${stack}/${id}`;
  for (const r of routesOf(t))
    if (
      r.authorization === "NONE" &&
      !(r.kind === "rest" && r.method === "OPTIONS") &&
      r.path !== "$connect" &&
      r.path !== "$disconnect" &&
      r.path !== "$default"
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "API-ROUTE-NO-AUTH",
          severity: "medium",
          title: `${r.method} ${r.path} has no authorizer`,
          explanation:
            "The route is open to anyone who can reach the API. That is right for a public endpoint and a mistake for anything else.",
          subject: `${at(r.api)}:${r.method} ${r.path}`,
          resources: [at(r.api)],
          recommendation:
            "Attach a JWT, IAM, or Lambda authorizer, or confirm the route is meant to be public.",
        }),
      );
  const routes = routesOf(t);
  const seen = new Map<string, string>();
  for (const r of routes) {
    const key = `${r.api}|${r.method}|${r.path.replace(/\{[^}]+\}/g, "{}")}`;
    const prev = seen.get(key);
    if (prev !== undefined && prev !== r.path)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "API-ROUTE-CONFLICT",
          severity: "high",
          title: `${r.method} ${r.path} conflicts with ${prev}`,
          explanation:
            "Two routes differ only in the name of a path parameter, so they match the same requests.",
          subject: key,
          resources: [at(r.api)],
        }),
      );
    seen.set(key, r.path);
  }
  for (const a of resourcesOfType(t, "AWS::ApiGatewayV2::Api")) {
    const cors = a.properties["CorsConfiguration"];
    if (
      isRecord(cors) &&
      Array.isArray(cors["AllowOrigins"]) &&
      cors["AllowOrigins"].includes("*") &&
      cors["AllowCredentials"] === true
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "API-CORS-WILDCARD-CREDENTIALS",
          severity: "high",
          title: "CORS allows any origin together with credentials",
          explanation:
            "Browsers reject this combination, and where it is honored it lets any site make authenticated calls.",
          subject: at(a.logicalId),
          resources: [at(a.logicalId)],
        }),
      );
    else if (
      isRecord(cors) &&
      Array.isArray(cors["AllowOrigins"]) &&
      cors["AllowOrigins"].includes("*")
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "API-CORS-WILDCARD",
          severity: "low",
          title: "CORS allows any origin",
          explanation: "Fine for a public API without cookies; otherwise list the origins.",
          subject: at(a.logicalId),
          resources: [at(a.logicalId)],
        }),
      );
  }
  for (const s of resourcesOfType(t, "AWS::ApiGatewayV2::Stage", "AWS::ApiGateway::Stage")) {
    if (s.properties["AccessLogSettings"] === undefined)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "API-STAGE-NO-ACCESS-LOG",
          severity: "low",
          title: "Stage has no access logging",
          explanation: "Without access logs, a request cannot be traced after the fact.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)],
        }),
      );
    if (
      s.properties["DefaultRouteSettings"] === undefined &&
      s.properties["MethodSettings"] === undefined
    )
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "API-STAGE-NO-THROTTLE",
          severity: "low",
          title: "Stage sets no throttling",
          explanation: "Only the account-level default limit protects the backend from a burst.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)],
        }),
      );
  }
  const plans = resourcesOfType(t, "AWS::ApiGateway::UsagePlan").length;
  for (const m of resourcesOfType(t, "AWS::ApiGateway::Method"))
    if (m.properties["ApiKeyRequired"] === true && plans === 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "API-KEY-NO-PLAN",
          severity: "medium",
          title: "A method requires an API key but no usage plan exists",
          explanation:
            "API keys only take effect through a usage plan; requests with any key will be rejected, or the requirement is not doing what was intended.",
          subject: at(m.logicalId),
          resources: [at(m.logicalId)],
        }),
      );
  return out;
}
