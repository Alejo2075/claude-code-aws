import {
  resourcesOfType,
  type ResourceInfo,
  type Template,
} from "@claude-code-aws/template-analysis";

export interface AuthRow {
  api: string;
  kind: "http" | "rest";
  route: string;
  authorization: string;
  authorizer: string | null;
  apiKeyRequired: boolean;
}

export interface AuthMatrix {
  schemaVersion: "1";
  rows: AuthRow[];
  authorizers: Array<{
    logicalId: string;
    type: string;
    audience: number | null;
    issuer: boolean | null;
  }>;
  cors: Array<{ api: string; allowOrigins: string[] }>;
}

const text = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function ref(value: unknown): string | null {
  if (isRecord(value) && typeof value["Ref"] === "string") return value["Ref"];
  if (
    isRecord(value) &&
    Array.isArray(value["Fn::GetAtt"]) &&
    typeof value["Fn::GetAtt"][0] === "string"
  )
    return value["Fn::GetAtt"][0];
  return null;
}

/** The URL path of a REST API resource, from its chain of PathPart/ParentId. Unresolved parts show as `{...}`. */
function restPath(template: Template, resourceId: string | null, depth = 0): string {
  if (resourceId === null || depth > 20) return "/{...}";
  const resource = template.resources[resourceId];
  if (resource?.type !== "AWS::ApiGateway::Resource") return "/";
  const part =
    typeof resource.properties["PathPart"] === "string" ? resource.properties["PathPart"] : "{...}";
  const parent = restPath(template, ref(resource.properties["ParentId"]), depth + 1);
  return `${parent === "/" ? "" : parent}/${part}`;
}

/** Which routes of the template's APIs have an authorizer, from the template alone. */
export function authMatrix(template: Template): AuthMatrix {
  const rows: AuthRow[] = [];
  for (const route of resourcesOfType(template, "AWS::ApiGatewayV2::Route")) {
    const authorizerId = ref(route.properties["AuthorizerId"]);
    rows.push({
      api: ref(route.properties["ApiId"]) ?? "unresolved",
      kind: "http",
      route: text(route.properties["RouteKey"], ""),
      authorization: text(route.properties["AuthorizationType"], "NONE"),
      authorizer: authorizerId,
      apiKeyRequired: false,
    });
  }
  for (const method of resourcesOfType(template, "AWS::ApiGateway::Method")) {
    rows.push({
      api: ref(method.properties["RestApiId"]) ?? "unresolved",
      kind: "rest",
      route: `${text(method.properties["HttpMethod"], "?")} ${restPath(template, ref(method.properties["ResourceId"]))}`,
      authorization: text(method.properties["AuthorizationType"], "NONE"),
      authorizer: ref(method.properties["AuthorizerId"]),
      apiKeyRequired: method.properties["ApiKeyRequired"] === true,
    });
  }
  const authorizers = [
    ...resourcesOfType(template, "AWS::ApiGatewayV2::Authorizer", "AWS::ApiGateway::Authorizer"),
  ].map((authorizer: ResourceInfo) => {
    const jwt = authorizer.properties["JwtConfiguration"];
    return {
      logicalId: authorizer.logicalId,
      type: text(
        authorizer.properties["AuthorizerType"],
        text(authorizer.properties["Type"], "unknown"),
      ),
      audience: isRecord(jwt) && Array.isArray(jwt["Audience"]) ? jwt["Audience"].length : null,
      issuer: isRecord(jwt) ? jwt["Issuer"] !== undefined : null,
    };
  });
  const cors = resourcesOfType(template, "AWS::ApiGatewayV2::Api").flatMap((api) => {
    const config = api.properties["CorsConfiguration"];
    const origins =
      isRecord(config) && Array.isArray(config["AllowOrigins"])
        ? config["AllowOrigins"].filter((o): o is string => typeof o === "string")
        : null;
    return origins === null ? [] : [{ api: api.logicalId, allowOrigins: origins }];
  });
  return { schemaVersion: "1", rows, authorizers, cors };
}

export function renderAuth(matrix: AuthMatrix): string {
  if (matrix.rows.length === 0) return "No API Gateway routes were found in the templates.";
  const lines = [
    "Routes and how they are authorized (from the template; the handler may still check more):",
    "",
  ];
  for (const row of matrix.rows) {
    const flag =
      row.authorization === "NONE" && !row.apiKeyRequired ? "  <-- no authorization" : "";
    lines.push(
      `  ${row.kind.toUpperCase().padEnd(4)} ${row.route.padEnd(36)} ${row.authorization}${row.authorizer === null ? "" : ` via ${row.authorizer}`}${row.apiKeyRequired ? " + API key" : ""}${flag}`,
    );
  }
  if (matrix.authorizers.length > 0) {
    lines.push("", "Authorizers:");
    for (const authorizer of matrix.authorizers) {
      lines.push(
        `  ${authorizer.logicalId}: ${authorizer.type}${authorizer.audience === null ? "" : `, ${authorizer.audience} audience(s), issuer ${authorizer.issuer === true ? "set" : "NOT set"}`}`,
      );
    }
  }
  for (const entry of matrix.cors)
    lines.push("", `CORS on ${entry.api}: ${entry.allowOrigins.join(", ") || "no origins listed"}`);
  lines.push(
    "",
    "Authentication is not authorization: a route with a JWT authorizer proves who the caller is. Whether the handler checks that this caller may touch this data (tenant isolation) is not visible in a template.",
  );
  return lines.join("\n");
}
