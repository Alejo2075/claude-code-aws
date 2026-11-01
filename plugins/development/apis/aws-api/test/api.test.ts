import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseTemplate } from "@claude-code-aws/template-analysis";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runCli } from "../src/lib/cli.js";
import {
  compareContract,
  contractRoutes,
  parseSpec,
  testPlan,
  validateOpenApi,
} from "../src/lib/openapi.js";
import { routesOf, rules } from "../src/lib/routes.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "aws-api-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});
const cli = (a: string[]) => runCli(a, { root, now: new Date("2026-10-31T00:00:00Z") });

const template = {
  Resources: {
    Api: {
      Type: "AWS::ApiGatewayV2::Api",
      Properties: {
        ProtocolType: "HTTP",
        CorsConfiguration: { AllowOrigins: ["*"], AllowCredentials: true },
      },
    },
    R1: {
      Type: "AWS::ApiGatewayV2::Route",
      Properties: { ApiId: { Ref: "Api" }, RouteKey: "GET /items/{id}", AuthorizationType: "JWT" },
    },
    R2: {
      Type: "AWS::ApiGatewayV2::Route",
      Properties: { ApiId: { Ref: "Api" }, RouteKey: "GET /items/{itemId}" },
    },
    R3: {
      Type: "AWS::ApiGatewayV2::Route",
      Properties: { ApiId: { Ref: "Api" }, RouteKey: "POST /items" },
    },
    Stage: {
      Type: "AWS::ApiGatewayV2::Stage",
      Properties: { ApiId: { Ref: "Api" }, StageName: "prod" },
    },
    M: {
      Type: "AWS::ApiGateway::Method",
      Properties: {
        RestApiId: { Ref: "Rest" },
        ResourceId: { Ref: "Res" },
        HttpMethod: "GET",
        AuthorizationType: "NONE",
        ApiKeyRequired: true,
      },
    },
    Res: {
      Type: "AWS::ApiGateway::Resource",
      Properties: {
        RestApiId: { Ref: "Rest" },
        ParentId: { "Fn::GetAtt": ["Rest", "RootResourceId"] },
        PathPart: "health",
      },
    },
    Rest: { Type: "AWS::ApiGateway::RestApi", Properties: {} },
  },
};

describe("route rules", () => {
  it("lists routes with authorization, including REST paths", () => {
    const p = parseTemplate(template);
    if (!p.ok) throw new Error(p.error);
    const routes = routesOf(p.template);
    expect(routes.map((r) => `${r.method} ${r.path} ${r.authorization}`)).toEqual(
      expect.arrayContaining(["GET /items/{id} JWT", "POST /items NONE", "GET /health NONE"]),
    );
  });
  it("finds open routes, conflicts, CORS, stages, and keys without plans", () => {
    const p = parseTemplate(template);
    if (!p.ok) throw new Error(p.error);
    const ids = rules("S", p.template).map((f) => f.ruleId);
    for (const id of [
      "API-ROUTE-NO-AUTH",
      "API-ROUTE-CONFLICT",
      "API-CORS-WILDCARD-CREDENTIALS",
      "API-STAGE-NO-ACCESS-LOG",
      "API-STAGE-NO-THROTTLE",
      "API-KEY-NO-PLAN",
    ])
      expect(ids, id).toContain(id);
  });
});

const good = {
  openapi: "3.0.3",
  info: { title: "Items", version: "1" },
  security: [{ jwt: [] }],
  components: {
    securitySchemes: { jwt: { type: "http", scheme: "bearer" } },
    schemas: { Item: { type: "object" } },
  },
  paths: {
    "/items": {
      get: {
        operationId: "listItems",
        parameters: [{ name: "limit", in: "query" }],
        responses: {
          "200": {
            description: "ok",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Item" } },
              },
            },
          },
          "400": { description: "bad" },
        },
      },
      post: {
        operationId: "createItem",
        requestBody: { content: {} },
        responses: { "201": { description: "created" }, "400": { description: "bad" } },
      },
    },
    "/items/{id}": {
      get: {
        operationId: "getItem",
        parameters: [{ name: "id", in: "path", required: true }],
        responses: { "200": { description: "ok" }, "404": { description: "missing" } },
      },
    },
  },
};
const msgs = (spec: unknown) =>
  validateOpenApi(spec)
    .map((i) => `${i.level}:${i.path} ${i.message}`)
    .join("\n");

describe("OpenAPI validation", () => {
  it("accepts a sound contract", () => {
    expect(validateOpenApi(good)).toEqual([]);
  });
  it("finds the usual mistakes", () => {
    const bad = JSON.parse(JSON.stringify(good)) as typeof good;
    (bad.paths["/items/{id}"].get as Record<string, unknown>)["parameters"] = [];
    (bad.paths["/items"].post as Record<string, unknown>)["operationId"] = "listItems";
    (bad.paths["/items"].get.responses as Record<string, unknown>)["200"] = {
      content: { "application/json": { schema: { $ref: "#/components/schemas/Missing" } } },
    };
    (bad.paths as Record<string, unknown>)["/items/{itemId}"] = {
      get: {
        operationId: "other",
        parameters: [{ name: "itemId", in: "path", required: true }],
        responses: { "200": { description: "x" } },
      },
    };
    (bad as Record<string, unknown>)["security"] = [{ nope: [] }];
    const m = msgs(bad);
    expect(m).toMatch(/path parameter \{id\} is not declared/);
    expect(m).toMatch(/"listItems" is also used/);
    expect(m).toMatch(/does not resolve/);
    expect(m).toMatch(/differ only in the name of a path parameter/);
    expect(m).toMatch(/"nope", which is not in components.securitySchemes/);
  });
  it("warns about missing operationId, error responses, pagination, and public operations", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: {
        "/things": {
          get: {
            responses: {
              "200": {
                description: "ok",
                content: { "application/json": { schema: { type: "array" } } },
              },
            },
          },
        },
      },
    };
    const m = msgs(spec);
    expect(m).toMatch(/no operationId/);
    expect(m).toMatch(/no error response/);
    expect(m).toMatch(/no pagination parameter/);
    expect(m).toMatch(/documented as public/);
  });
  it("rejects documents that are not OpenAPI and parses YAML", () => {
    expect(msgs({})).toMatch(/openapi/);
    expect(msgs({ openapi: "3.0.0", info: { title: "t", version: "1" }, paths: {} })).toMatch(
      /at least one path/,
    );
    expect(parseSpec("openapi: 3.0.0\ninfo:\n  title: t\n  version: '1'\npaths: {}").ok).toBe(true);
    expect(parseSpec("a: [").ok).toBe(false);
  });
});

describe("contract comparison and test plans", () => {
  it("matches routes ignoring parameter names and reports the rest", () => {
    const d = compareContract(contractRoutes(good), [
      { method: "GET", path: "/items" },
      { method: "GET", path: "/items/{itemId}" },
      { method: "DELETE", path: "/items/{itemId}" },
    ]);
    expect(d.matched).toBe(2);
    expect(d.missing).toEqual(["POST /items"]);
    expect(d.extra).toEqual(["DELETE /items/{}"]);
  });
  it("prints read-only curl commands with a token placeholder, and lists writes for approval", () => {
    const plan = testPlan(good, "https://api.example.com/prod");
    expect(plan.safe).toContain(
      'curl -sS -X GET -H "Authorization: Bearer $TOKEN" "https://api.example.com/prod/items/<id>"',
    );
    expect(plan.needsApproval).toEqual(["POST /items"]);
    expect(JSON.stringify(plan)).not.toMatch(/-X (POST|PUT|DELETE)/);
  });
});

describe("the command line", () => {
  it("runs each command and validates input", async () => {
    mkdirSync(join(root, "cdk.out"));
    writeFileSync(join(root, "cdk.out/S.template.json"), JSON.stringify(template));
    expect((await cli(["inspect"])).stdout).toContain("API-ROUTE-NO-AUTH");
    expect((await cli(["routes"])).stdout).toMatch(/http\s+GET\s+\/items\/\{id\}/);
    writeFileSync(join(root, "spec.json"), JSON.stringify(good));
    expect((await cli(["validate", "spec.json"])).stdout).toMatch(/^Valid/);
    expect((await cli(["contract-diff", "spec.json"])).stdout).toMatch(
      /not declared in the templates|not in the contract/,
    );
    expect(
      (await cli(["test-plan", "spec.json", "--base-url", "https://api.example.com/prod"])).stdout,
    ).toMatch(/NOT SENT/);
    expect(
      (await cli(["test-plan", "spec.json", "--base-url", "javascript:alert(1)"])).exitCode,
    ).toBe(2);
    writeFileSync(join(root, "bad.json"), "{");
    expect((await cli(["validate", "bad.json"])).exitCode).toBe(1);
    expect((await cli(["validate", "../outside.json"])).exitCode).toBe(1);
    expect((await cli(["nope"])).exitCode).toBe(2);
  });
});
