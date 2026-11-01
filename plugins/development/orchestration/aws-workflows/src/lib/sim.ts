// A logical walk through a state machine. It evaluates Pass, Choice, Wait, Succeed, and Fail on the
// input you give; a Task needs a mock result, and Parallel and Map are not walked. It is NOT an
// execution: no service is called, nothing is waited for, and input and output processing is the
// subset described in the README.
type Obj = Record<string, unknown>;
const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function getPath(data: unknown, path: string): { found: boolean; value: unknown } {
  if (path === "$") return { found: true, value: data };
  if (!/^\$(\.[A-Za-z0-9_-]+)+$/.test(path)) return { found: false, value: undefined };
  let cur: unknown = data;
  for (const part of path.slice(2).split(".")) {
    if (!isObj(cur) || !(part in cur)) return { found: false, value: undefined };
    cur = cur[part];
  }
  return { found: true, value: cur };
}

function setPath(data: unknown, path: string, value: unknown): unknown {
  if (path === "$") return value;
  if (!/^\$(\.[A-Za-z0-9_-]+)+$/.test(path)) return data;
  const parts = path.slice(2).split(".");
  const root: Obj = isObj(data) ? { ...data } : {};
  let cur = root;
  parts.forEach((p, i) => {
    if (i === parts.length - 1) cur[p] = value;
    else {
      const next = isObj(cur[p]) ? { ...cur[p] } : {};
      cur[p] = next;
      cur = next;
    }
  });
  return root;
}

export function evalChoice(rule: unknown, input: unknown): boolean | null {
  if (!isObj(rule)) return null;
  if (Array.isArray(rule["And"])) return rule["And"].every((r) => evalChoice(r, input) === true);
  if (Array.isArray(rule["Or"])) return rule["Or"].some((r) => evalChoice(r, input) === true);
  if ("Not" in rule) {
    const inner = evalChoice(rule["Not"], input);
    return inner === null ? null : !inner;
  }
  if (typeof rule["Variable"] !== "string") return null;
  const v = getPath(input, rule["Variable"]);
  if ("IsPresent" in rule) return v.found === rule["IsPresent"];
  if (!v.found) return false;
  const cmp = (op: string, a: unknown, b: unknown): boolean | null => {
    if (op === "Equals") return a === b;
    if (typeof a === "number" && typeof b === "number")
      return op === "LessThan"
        ? a < b
        : op === "GreaterThan"
          ? a > b
          : op === "LessThanEquals"
            ? a <= b
            : op === "GreaterThanEquals"
              ? a >= b
              : null;
    if (typeof a === "string" && typeof b === "string")
      return op === "LessThan"
        ? a < b
        : op === "GreaterThan"
          ? a > b
          : op === "LessThanEquals"
            ? a <= b
            : op === "GreaterThanEquals"
              ? a >= b
              : null;
    return null;
  };
  for (const [key, expected] of Object.entries(rule)) {
    const m =
      /^(String|Numeric|Boolean)(Equals|LessThan|GreaterThan|LessThanEquals|GreaterThanEquals)$/.exec(
        key,
      );
    if (m === null) continue;
    const type = m[1];
    if (
      (type === "String" && typeof v.value !== "string") ||
      (type === "Numeric" && typeof v.value !== "number") ||
      (type === "Boolean" && typeof v.value !== "boolean")
    )
      return false;
    return cmp(m[2] ?? "", v.value, expected);
  }
  return null;
}

export interface Step {
  state: string;
  type: string;
  note: string;
  output?: unknown;
}

export interface SimResult {
  status: "succeeded" | "failed" | "stopped";
  reason: string;
  steps: Step[];
  output: unknown;
}

export function simulate(
  definition: unknown,
  input: unknown,
  mocks: Record<string, unknown>,
  maxSteps = 100,
): SimResult {
  const steps: Step[] = [];
  if (
    !isObj(definition) ||
    !isObj(definition["States"]) ||
    typeof definition["StartAt"] !== "string"
  )
    return {
      status: "stopped",
      reason: "the definition has no StartAt and States",
      steps,
      output: input,
    };
  const states = definition["States"];
  let name = definition["StartAt"];
  let data: unknown = input;
  for (let n = 0; n < maxSteps; n += 1) {
    const raw = states[name];
    if (!isObj(raw))
      return { status: "stopped", reason: `state "${name}" does not exist`, steps, output: data };
    const type = String(raw["Type"]);
    const log = (note: string, output?: unknown): void =>
      void steps.push({ state: name, type, note, ...(output === undefined ? {} : { output }) });
    const next = (): string | null =>
      raw["End"] === true ? null : typeof raw["Next"] === "string" ? raw["Next"] : null;
    if (type === "Succeed") {
      log("succeeded");
      return { status: "succeeded", reason: "reached a Succeed state", steps, output: data };
    }
    if (type === "Fail") {
      log(`failed: ${txt(raw["Error"])} ${txt(raw["Cause"])}`.trim());
      return { status: "failed", reason: `reached Fail state ${name}`, steps, output: data };
    }
    if (type === "Choice") {
      const choices: unknown[] = Array.isArray(raw["Choices"]) ? (raw["Choices"] as unknown[]) : [];
      const hit = choices.find((c) => evalChoice(c, data) === true);
      if (choices.some((c) => evalChoice(c, data) === null))
        return {
          status: "stopped",
          reason: `Choice ${name} uses a comparison this simulator does not evaluate`,
          steps,
          output: data,
        };
      const to =
        hit !== undefined && isObj(hit)
          ? String(hit["Next"])
          : typeof raw["Default"] === "string"
            ? raw["Default"]
            : null;
      if (to === null) {
        log("no rule matched and there is no Default (States.NoChoiceMatched)");
        return { status: "failed", reason: "States.NoChoiceMatched", steps, output: data };
      }
      log(`chose ${to}`);
      name = to;
      continue;
    }
    if (type === "Pass") {
      const result = "Result" in raw ? raw["Result"] : data;
      data =
        typeof raw["ResultPath"] === "string" ? setPath(data, raw["ResultPath"], result) : result;
      log("passed", data);
    } else if (type === "Wait") log("wait skipped (not waited for)");
    else if (type === "Task") {
      if (!(name in mocks))
        return {
          status: "stopped",
          reason: `Task ${name} needs a mock result (--mock ${name}=<json>); no service is called`,
          steps,
          output: data,
        };
      data =
        typeof raw["ResultPath"] === "string"
          ? setPath(data, raw["ResultPath"], mocks[name])
          : mocks[name];
      log("task result taken from the mock", data);
    } else
      return { status: "stopped", reason: `${type} states are not simulated`, steps, output: data };
    const to = next();
    if (to === null) return { status: "succeeded", reason: "reached End", steps, output: data };
    name = to;
  }
  return {
    status: "stopped",
    reason: `stopped after ${maxSteps} steps (possible loop)`,
    steps,
    output: data,
  };
}
