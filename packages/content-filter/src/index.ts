// Matches an event against an EventBridge-style content filter. Operators follow the EventBridge
// documentation (comparison operators for event patterns). It is a local approximation for trying
// patterns: the service is the authority, and edge cases (arrays of objects, very large numbers) are
// documented in the plugin README rather than guessed here.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const isObject = (v: unknown): v is { [key: string]: Json } =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const MAX_DEPTH = 20;
export const MAX_PATTERN_BYTES = 100_000;

export interface PatternProblem {
  path: string;
  message: string;
}

const OPERATORS = [
  "prefix",
  "suffix",
  "anything-but",
  "numeric",
  "exists",
  "cidr",
  "wildcard",
  "equals-ignore-case",
];

/** Checks the pattern's shape. Returns an empty list when every rule is understood. */
export function checkPattern(pattern: unknown, path = "$", depth = 0): PatternProblem[] {
  const problems: PatternProblem[] = [];
  if (depth > MAX_DEPTH) return [{ path, message: "pattern is nested too deeply" }];
  if (!isObject(pattern)) return [{ path, message: "a pattern must be an object" }];
  for (const [key, value] of Object.entries(pattern)) {
    const here = `${path}.${key}`;
    if (key === "$or") {
      if (!Array.isArray(value) || value.length === 0)
        problems.push({ path: here, message: "$or must be a non-empty list of patterns" });
      else value.forEach((p, i) => problems.push(...checkPattern(p, `${here}[${i}]`, depth + 1)));
    } else if (Array.isArray(value)) {
      if (value.length === 0) problems.push({ path: here, message: "a rule list cannot be empty" });
      for (const rule of value) {
        if (isObject(rule)) {
          const ops = Object.keys(rule);
          if (ops.length !== 1 || !OPERATORS.includes(ops[0] ?? ""))
            problems.push({
              path: here,
              message: `unknown or combined operator: ${ops.join(", ")}`,
            });
          else if (ops[0] === "numeric" && !numericOk(rule["numeric"]))
            problems.push({
              path: here,
              message: "numeric needs [op, number] or [op, number, op, number]",
            });
          else if (ops[0] === "exists" && typeof rule["exists"] !== "boolean")
            problems.push({ path: here, message: "exists needs true or false" });
        } else if (!(rule === null || ["string", "number", "boolean"].includes(typeof rule)))
          problems.push({ path: here, message: "a rule must be a literal or an operator object" });
      }
    } else if (isObject(value)) problems.push(...checkPattern(value, here, depth + 1));
    else
      problems.push({ path: here, message: "a field must be a list of rules or a nested pattern" });
  }
  return problems;
}

function numericOk(v: Json | undefined): boolean {
  if (!Array.isArray(v) || (v.length !== 2 && v.length !== 4)) return false;
  const ops = new Set(["<", "<=", ">", ">=", "="]);
  for (let i = 0; i < v.length; i += 2)
    if (!(typeof v[i] === "string" && ops.has(v[i] as string) && typeof v[i + 1] === "number"))
      return false;
  return true;
}

function wildcardMatch(value: string, glob: string): boolean {
  const parts = glob.split("*");
  if (parts.length === 1) return value === glob;
  const first = parts[0] ?? "";
  if (!value.startsWith(first)) return false;
  let pos = first.length;
  for (let i = 1; i < parts.length - 1; i += 1) {
    const idx = value.indexOf(parts[i] ?? "", pos);
    if (idx < 0) return false;
    pos = idx + (parts[i] ?? "").length;
  }
  const last = parts[parts.length - 1] ?? "";
  return value.length - last.length >= pos && value.endsWith(last);
}

function ipv4(value: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (m === null) return null;
  const parts = m.slice(1).map(Number);
  return parts.some((p) => p > 255)
    ? null
    : (parts[0] ?? 0) * 2 ** 24 +
        (parts[1] ?? 0) * 2 ** 16 +
        (parts[2] ?? 0) * 256 +
        (parts[3] ?? 0);
}

function cidrMatch(value: string, cidr: string): boolean {
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  const b = ipv4(base ?? "");
  const v = ipv4(value);
  if (b === null || v === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(b / size) === Math.floor(v / size);
}

const asList = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

function textRule(value: string, op: string, arg: Json): boolean {
  const ignore = isObject(arg) ? asList(arg["equals-ignore-case"] ?? [])[0] : undefined;
  const ci = typeof ignore === "string" ? ignore : null;
  const want = ci ?? (typeof arg === "string" ? arg : null);
  if (want === null) return false;
  const [v, w] = ci === null ? [value, want] : [value.toLowerCase(), want.toLowerCase()];
  return op === "prefix" ? v.startsWith(w) : v.endsWith(w);
}

function numericMatch(value: number, spec: Json[]): boolean {
  for (let i = 0; i < spec.length; i += 2) {
    const op = spec[i];
    const n = spec[i + 1] as number;
    const ok =
      op === "<"
        ? value < n
        : op === "<="
          ? value <= n
          : op === ">"
            ? value > n
            : op === ">="
              ? value >= n
              : value === n;
    if (!ok) return false;
  }
  return true;
}

/** One rule against one scalar event value. */
function ruleMatches(rule: Json, value: Json): boolean {
  if (!isObject(rule))
    return (
      rule === value || (typeof rule === "number" && typeof value === "number" && rule === value)
    );
  const [op] = Object.keys(rule);
  const arg = rule[op ?? ""] as Json;
  switch (op) {
    case "prefix":
    case "suffix":
      return typeof value === "string" && textRule(value, op, arg);
    case "equals-ignore-case":
      return (
        typeof value === "string" &&
        typeof arg === "string" &&
        value.toLowerCase() === arg.toLowerCase()
      );
    case "wildcard":
      return typeof value === "string" && typeof arg === "string" && wildcardMatch(value, arg);
    case "numeric":
      return typeof value === "number" && Array.isArray(arg) && numericMatch(value, arg);
    case "cidr":
      return typeof value === "string" && typeof arg === "string" && cidrMatch(value, arg);
    case "anything-but": {
      if (isObject(arg)) {
        const [inner] = Object.keys(arg);
        const list = asList(arg[inner ?? ""] as Json);
        if (typeof value !== "string") return false;
        if (inner === "prefix" || inner === "suffix")
          return !list.some((x) => textRule(value, inner, x));
        if (inner === "equals-ignore-case")
          return !list.some(
            (x) => typeof x === "string" && x.toLowerCase() === value.toLowerCase(),
          );
        if (inner === "wildcard")
          return !list.some((x) => typeof x === "string" && wildcardMatch(value, x));
        return false;
      }
      return !asList(arg).some((x) => x === value);
    }
    default:
      return false;
  }
}

function fieldMatches(rules: Json[], value: Json | undefined): boolean {
  const exists = rules.find((r) => isObject(r) && "exists" in r);
  if (value === undefined) return rules.some((r) => isObject(r) && r["exists"] === false);
  if (rules.some((r) => isObject(r) && r["exists"] === true) && exists !== undefined) return true;
  const values = Array.isArray(value) ? value : [value];
  return rules.some((rule) => {
    if (isObject(rule) && "exists" in rule) return false;
    // anything-but on a list holds when no element is excluded.
    if (isObject(rule) && "anything-but" in rule) return values.every((v) => ruleMatches(rule, v));
    return values.some((v) => ruleMatches(rule, v));
  });
}

export function matches(pattern: { [key: string]: Json }, event: Json, depth = 0): boolean {
  if (depth > MAX_DEPTH) return false;
  if (Array.isArray(event)) return event.some((e) => matches(pattern, e, depth + 1));
  if (!isObject(event)) return false;
  return Object.entries(pattern).every(([key, rule]) => {
    if (key === "$or")
      return Array.isArray(rule) && rule.some((p) => isObject(p) && matches(p, event, depth + 1));
    const value = event[key];
    if (Array.isArray(rule)) return fieldMatches(rule, value);
    if (isObject(rule)) return value !== undefined && matches(rule, value, depth + 1);
    return false;
  });
}

/** Which fields of a failing match caused the miss, for explaining it. */
export function explainMiss(pattern: { [key: string]: Json }, event: Json, path = "$"): string[] {
  if (!isObject(event)) return [`${path} is not an object`];
  const out: string[] = [];
  for (const [key, rule] of Object.entries(pattern)) {
    if (key === "$or") {
      if (!(Array.isArray(rule) && rule.some((p) => isObject(p) && matches(p, event))))
        out.push(`${path}: none of the $or alternatives match`);
      continue;
    }
    const value = event[key];
    if (Array.isArray(rule)) {
      if (!fieldMatches(rule, value))
        out.push(
          value === undefined
            ? `${path}.${key} is missing from the event`
            : `${path}.${key} = ${JSON.stringify(value)} matches none of ${JSON.stringify(rule)}`,
        );
    } else if (isObject(rule)) {
      if (value === undefined) out.push(`${path}.${key} is missing from the event`);
      else out.push(...explainMiss(rule, value, `${path}.${key}`));
    }
  }
  return out;
}
