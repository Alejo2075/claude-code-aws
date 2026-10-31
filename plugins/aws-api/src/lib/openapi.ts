import { parse } from "yaml";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

export interface Issue {
  level: "error" | "warning";
  path: string;
  message: string;
}

export function parseSpec(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (text.length > 2_000_000) return { ok: false, error: "the document is too large" };
  try {
    return {
      ok: true,
      value: text.trimStart().startsWith("{")
        ? (JSON.parse(text) as unknown)
        : (parse(text, { maxAliasCount: 50, strict: true }) as unknown),
    };
  } catch {
    return { ok: false, error: "the document is neither valid JSON nor valid YAML" };
  }
}

function resolveRef(root: unknown, ref: string): boolean {
  if (!ref.startsWith("#/")) return true; // external references are not followed
  let cur: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    const key = part.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!isObj(cur) || !(key in cur)) return false;
    cur = cur[key];
  }
  return true;
}

function refs(value: unknown, path: string, root: unknown, issues: Issue[], depth = 0): void {
  if (depth > 40) return;
  if (Array.isArray(value)) {
    value.forEach((v, i) => {
      refs(v, `${path}[${i}]`, root, issues, depth + 1);
    });
    return;
  }
  if (!isObj(value)) return;
  if (typeof value["$ref"] === "string" && !resolveRef(root, value["$ref"]))
    issues.push({ level: "error", path, message: `$ref ${value["$ref"]} does not resolve` });
  for (const [k, v] of Object.entries(value)) refs(v, `${path}.${k}`, root, issues, depth + 1);
}

export function validateOpenApi(spec: unknown): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], path: string, message: string): void =>
    void issues.push({ level, path, message });
  if (!isObj(spec))
    return [{ level: "error", path: "$", message: "the document must be an object" }];
  if (typeof spec["openapi"] !== "string" || !/^3\.\d+\.\d+$/.test(spec["openapi"]))
    add("error", "$.openapi", "must be an OpenAPI 3.x version string such as 3.0.3");
  if (
    !isObj(spec["info"]) ||
    typeof spec["info"]["title"] !== "string" ||
    typeof spec["info"]["version"] !== "string"
  )
    add("error", "$.info", "needs title and version");
  const paths = spec["paths"];
  if (!isObj(paths) || Object.keys(paths).length === 0) {
    add("error", "$.paths", "must define at least one path");
    return issues;
  }
  refs(spec, "$", spec, issues);
  const schemes =
    isObj(spec["components"]) && isObj(spec["components"]["securitySchemes"])
      ? Object.keys(spec["components"]["securitySchemes"])
      : [];
  const globalSecurity = Array.isArray(spec["security"]) && spec["security"].length > 0;
  const operationIds = new Map<string, string>();
  const shapes = new Map<string, string>();
  for (const [path, item] of Object.entries(paths)) {
    if (!path.startsWith("/")) add("error", `$.paths.${path}`, "a path must start with /");
    const shape = path.replace(/\{[^}]+\}/g, "{}");
    const prev = shapes.get(shape);
    if (prev !== undefined)
      add(
        "error",
        `$.paths.${path}`,
        `conflicts with ${prev}: they differ only in the name of a path parameter`,
      );
    shapes.set(shape, path);
    if (!isObj(item)) continue;
    const templated = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? "");
    for (const method of METHODS) {
      const op = item[method];
      if (!isObj(op)) continue;
      const here = `$.paths.${path}.${method}`;
      if (typeof op["operationId"] === "string") {
        const dup = operationIds.get(op["operationId"]);
        if (dup !== undefined)
          add("error", `${here}.operationId`, `"${op["operationId"]}" is also used by ${dup}`);
        operationIds.set(op["operationId"], here);
      } else add("warning", here, "has no operationId, which generated clients need");
      const params = [
        ...(Array.isArray(item["parameters"]) ? (item["parameters"] as unknown[]) : []),
        ...(Array.isArray(op["parameters"]) ? (op["parameters"] as unknown[]) : []),
      ].filter(isObj);
      for (const name of templated) {
        const p = params.find((x) => x["in"] === "path" && x["name"] === name);
        if (p === undefined && !params.some((x) => typeof x["$ref"] === "string"))
          add("error", here, `path parameter {${name}} is not declared`);
        else if (p !== undefined && p["required"] !== true)
          add("error", here, `path parameter {${name}} must be required: true`);
      }
      const responses = op["responses"];
      if (!isObj(responses) || Object.keys(responses).length === 0)
        add("error", `${here}.responses`, "needs at least one response");
      else {
        const codes = Object.keys(responses);
        if (!codes.some((c) => /^2\d\d$|^2XX$|^default$/.test(c)))
          add("warning", `${here}.responses`, "has no success (2xx) response");
        if (!codes.some((c) => /^[45]\d\d$|^[45]XX$|^default$/.test(c)))
          add(
            "warning",
            `${here}.responses`,
            "defines no error response; document the 400, 401/403, and 404 cases a client must handle",
          );
      }
      if (
        (method === "post" || method === "put" || method === "patch") &&
        op["requestBody"] === undefined
      )
        add("warning", here, "a write operation without a requestBody");
      const sec = Array.isArray(op["security"]) ? op["security"] : null;
      if (sec === null && !globalSecurity)
        add(
          "warning",
          here,
          "has no security requirement (neither its own nor a global one): it is documented as public",
        );
      for (const req of [
        ...((sec as unknown[] | null) ?? []),
        ...(Array.isArray(spec["security"]) ? (spec["security"] as unknown[]) : []),
      ])
        if (isObj(req))
          for (const n of Object.keys(req))
            if (!schemes.includes(n))
              add(
                "error",
                `${here}.security`,
                `uses "${n}", which is not in components.securitySchemes`,
              );
      if (method === "get" && !/\{[^}]+\}\s*$/.test(path)) {
        const ok =
          isObj(responses) &&
          Object.entries(responses).some(
            ([c, r]) => c.startsWith("2") && JSON.stringify(r).includes('"type":"array"'),
          );
        const paged = params.some((p) =>
          ["limit", "pageSize", "page_size", "nextToken", "cursor", "next_token", "page"].includes(
            String(p["name"]),
          ),
        );
        if (ok && !paged)
          add(
            "warning",
            here,
            "returns a list with no pagination parameter (limit, cursor, or nextToken); the response will grow without bound",
          );
      }
    }
  }
  return issues;
}

/** Paths and methods in the contract, with parameter names normalized. */
export function contractRoutes(spec: unknown): Array<{ method: string; path: string }> {
  const out: Array<{ method: string; path: string }> = [];
  if (!isObj(spec) || !isObj(spec["paths"])) return out;
  for (const [path, item] of Object.entries(spec["paths"]))
    if (isObj(item))
      for (const m of METHODS) if (isObj(item[m])) out.push({ method: m.toUpperCase(), path });
  return out;
}

const norm = (p: string): string => p.replace(/\{[^}]+\+?\}/g, "{}").replace(/\/+$/, "") || "/";

export function compareContract(
  contract: Array<{ method: string; path: string }>,
  deployed: Array<{ method: string; path: string }>,
): { missing: string[]; extra: string[]; matched: number } {
  const key = (r: { method: string; path: string }): string => `${r.method} ${norm(r.path)}`;
  const d = new Set(
    deployed.flatMap((r) =>
      r.method === "ANY"
        ? ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => `${m} ${norm(r.path)}`)
        : [key(r)],
    ),
  );
  const c = new Set(contract.map(key));
  const catchAll = deployed.some(
    (r) => r.path === "$default" || r.path === "/{proxy+}" || r.path === "/{proxy+}",
  );
  return {
    missing: [...c].filter((k) => !d.has(k) && !catchAll).sort(),
    extra: [...d].filter((k) => !c.has(k) && !k.includes("OPTIONS")).sort(),
    matched: [...c].filter((k) => d.has(k)).length,
  };
}

/** curl commands for operations that only read. Credentials are placeholders; nothing is sent. */
export function testPlan(
  spec: unknown,
  baseUrl: string,
): { safe: string[]; needsApproval: string[] } {
  const safe: string[] = [];
  const unsafe: string[] = [];
  const secured = isObj(spec) && (Array.isArray(spec["security"]) || false);
  for (const r of contractRoutes(spec)) {
    const url = `${baseUrl.replace(/\/+$/, "")}${r.path.replace(/\{([^}]+)\}/g, "<$1>")}`;
    const auth = secured ? ' -H "Authorization: Bearer $TOKEN"' : "";
    if (r.method === "GET" || r.method === "HEAD")
      safe.push(`curl -sS -X ${r.method}${auth} "${url}"`);
    else unsafe.push(`${r.method} ${r.path}`);
  }
  return { safe, needsApproval: unsafe };
}
