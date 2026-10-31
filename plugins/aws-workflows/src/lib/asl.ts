// Structural validation of Amazon States Language. It checks shape and flow, not whether a resource
// ARN exists or an IAM role may call it. Findings are errors (the service would reject the
// definition) or warnings (accepted, but likely a mistake).
export interface Issue {
  level: "error" | "warning";
  path: string;
  message: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const TYPES = ["Task", "Pass", "Choice", "Wait", "Succeed", "Fail", "Parallel", "Map"];
const JSONPATH_FIELDS = [
  "InputPath",
  "Parameters",
  "ResultPath",
  "ResultSelector",
  "OutputPath",
  "ItemsPath",
  "ItemSelector",
];
const JSONATA_FIELDS = ["Arguments", "Output"];
const MAX_STATES = 1000;

export interface Options {
  type?: "STANDARD" | "EXPRESS";
}

export function validateAsl(definition: unknown, options: Options = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], path: string, message: string): void =>
    void issues.push({ level, path, message });
  let budget = MAX_STATES;
  const topLanguage =
    isObj(definition) && definition["QueryLanguage"] === "JSONata" ? "JSONata" : "JSONPath";

  const machine = (def: unknown, path: string, language: string, depth: number): void => {
    if (!isObj(def)) {
      add("error", path, "must be an object with StartAt and States");
      return;
    }
    if (depth > 10) {
      add("error", path, "is nested too deeply");
      return;
    }
    const states = def["States"];
    if (!isObj(states) || Object.keys(states).length === 0) {
      add("error", `${path}.States`, "must be a non-empty object");
      return;
    }
    const start = def["StartAt"];
    if (typeof start !== "string") add("error", `${path}.StartAt`, "must name the first state");
    else if (!(start in states))
      add("error", `${path}.StartAt`, `names "${start}", which is not a state`);
    const edges = new Map<string, string[]>();
    let terminal = 0;
    for (const [name, raw] of Object.entries(states)) {
      if (budget-- <= 0) {
        add("error", path, `has more than ${MAX_STATES} states; stopped checking`);
        return;
      }
      const here = `${path}.States.${name}`;
      if (!isObj(raw)) {
        add("error", here, "must be an object");
        continue;
      }
      const type = raw["Type"];
      if (typeof type !== "string" || !TYPES.includes(type)) {
        add("error", here, `Type must be one of ${TYPES.join(", ")}`);
        continue;
      }
      const lang =
        raw["QueryLanguage"] === "JSONata"
          ? "JSONata"
          : raw["QueryLanguage"] === "JSONPath"
            ? "JSONPath"
            : language;
      const targets: string[] = [];
      const needTarget = (value: unknown, where: string): void => {
        if (typeof value !== "string") {
          add("error", where, "must name a state");
          return;
        }
        if (!(value in states)) {
          add("error", where, `names "${value}", which is not a state in this scope`);
          return;
        }
        targets.push(value);
      };
      if (lang === "JSONata")
        for (const f of JSONPATH_FIELDS)
          if (f in raw)
            add(
              "error",
              `${here}.${f}`,
              "is a JSONPath field and cannot be used with the JSONata query language",
            );
      if (lang === "JSONPath")
        for (const f of JSONATA_FIELDS)
          if (f in raw)
            add(
              "error",
              `${here}.${f}`,
              "is a JSONata field; set QueryLanguage to JSONata or use Parameters and ResultSelector",
            );
      const ends = type === "Succeed" || type === "Fail";
      if (ends) {
        terminal += 1;
        for (const f of ["Next", "End"])
          if (f in raw) add("error", `${here}.${f}`, `${type} states cannot have ${f}`);
      } else if (type === "Choice") {
        const choices = raw["Choices"];
        if (!Array.isArray(choices) || choices.length === 0)
          add("error", `${here}.Choices`, "must be a non-empty list");
        else
          choices.forEach((c, i) => {
            if (isObj(c)) needTarget(c["Next"], `${here}.Choices[${i}].Next`);
            else add("error", `${here}.Choices[${i}]`, "must be an object");
          });
        if (raw["Default"] === undefined)
          add(
            "warning",
            here,
            "has no Default: an input that matches no rule fails with States.NoChoiceMatched",
          );
        else needTarget(raw["Default"], `${here}.Default`);
        for (const f of ["Next", "End"])
          if (f in raw) add("error", `${here}.${f}`, "Choice states cannot have Next or End");
      } else {
        const hasNext = raw["Next"] !== undefined;
        const hasEnd = raw["End"] === true;
        if (hasNext === hasEnd)
          add(
            "error",
            here,
            hasNext
              ? "has both Next and End"
              : "has neither Next nor End, so the machine cannot continue or finish here",
          );
        if (hasNext) needTarget(raw["Next"], `${here}.Next`);
        if (hasEnd) terminal += 1;
      }
      if (type === "Task") {
        if (typeof raw["Resource"] !== "string" || raw["Resource"] === "")
          add("error", `${here}.Resource`, "Task states need a Resource");
        else if (
          options.type === "EXPRESS" &&
          /\.(sync(:2)?|waitForTaskToken)$/.test(raw["Resource"])
        )
          add(
            "error",
            `${here}.Resource`,
            "Express workflows do not support the .sync and .waitForTaskToken integration patterns",
          );
        if (raw["TimeoutSeconds"] === undefined && raw["TimeoutSecondsPath"] === undefined)
          add(
            "warning",
            here,
            "has no TimeoutSeconds: set one explicitly so a hung task cannot hold the execution",
          );
      }
      if (
        type === "Wait" &&
        !["Seconds", "Timestamp", "SecondsPath", "TimestampPath"].some((f) => f in raw)
      )
        add("error", here, "Wait states need Seconds, Timestamp, SecondsPath, or TimestampPath");
      if (type === "Parallel") {
        if (!Array.isArray(raw["Branches"]) || raw["Branches"].length === 0)
          add("error", `${here}.Branches`, "must be a non-empty list");
        else
          raw["Branches"].forEach((b, i) => {
            machine(b, `${here}.Branches[${i}]`, lang, depth + 1);
          });
      }
      if (type === "Map") {
        const proc = raw["ItemProcessor"] ?? raw["Iterator"];
        if (proc === undefined) add("error", here, "Map states need an ItemProcessor");
        else machine(proc, `${here}.ItemProcessor`, lang, depth + 1);
        const mc = raw["MaxConcurrency"];
        if (mc === undefined || mc === 0)
          add(
            "warning",
            here,
            "has no MaxConcurrency limit: a large array can fan out far beyond what downstream services accept",
          );
      }
      for (const kind of ["Retry", "Catch"] as const) {
        const list = raw[kind];
        if (list === undefined) continue;
        if (!Array.isArray(list)) {
          add("error", `${here}.${kind}`, "must be a list");
          continue;
        }
        list.forEach((r, i) => {
          const w = `${here}.${kind}[${i}]`;
          if (!isObj(r) || !Array.isArray(r["ErrorEquals"]) || r["ErrorEquals"].length === 0) {
            add("error", w, "needs a non-empty ErrorEquals list");
            return;
          }
          const eq = r["ErrorEquals"] as unknown[];
          if (eq.includes("States.ALL") && (eq.length > 1 || i !== list.length - 1))
            add("error", w, "States.ALL must be alone in its ErrorEquals and in the last entry");
          if (kind === "Catch") needTarget(r["Next"], `${w}.Next`);
          else {
            if (
              r["MaxAttempts"] !== undefined &&
              (!Number.isInteger(r["MaxAttempts"]) || (r["MaxAttempts"] as number) < 0)
            )
              add("error", `${w}.MaxAttempts`, "must be a whole number, 0 or more");
            if (typeof r["BackoffRate"] === "number" && r["BackoffRate"] < 1)
              add("error", `${w}.BackoffRate`, "must be 1.0 or more");
            if (typeof r["IntervalSeconds"] === "number" && r["IntervalSeconds"] < 1)
              add("error", `${w}.IntervalSeconds`, "must be a positive whole number");
            if (typeof r["MaxAttempts"] === "number" && r["MaxAttempts"] > 10)
              add(
                "warning",
                `${w}.MaxAttempts`,
                "is more than 10: with a Map or high traffic this multiplies load on a failing dependency (retry storm)",
              );
            if (
              typeof r["BackoffRate"] === "number" &&
              r["BackoffRate"] === 1 &&
              (r["MaxAttempts"] ?? 3) !== 0
            )
              add(
                "warning",
                `${w}.BackoffRate`,
                "is 1: retries come at a fixed rate; use 2 with jitter for a failing dependency",
              );
          }
        });
      }
      edges.set(name, targets);
    }
    if (terminal === 0)
      add(
        "error",
        path,
        "has no terminal state (End: true, Succeed, or Fail), so it can never finish",
      );
    // Reachability and cycles from StartAt.
    if (typeof start === "string" && start in states) {
      const seen = new Set<string>();
      const stack = [start];
      while (stack.length > 0) {
        const n = stack.pop() as string;
        if (seen.has(n)) continue;
        seen.add(n);
        for (const t of edges.get(n) ?? []) stack.push(t);
      }
      for (const name of Object.keys(states))
        if (!seen.has(name))
          add("warning", `${path}.States.${name}`, "cannot be reached from StartAt");
      const color = new Map<string, 1 | 2>();
      const walk = (n: string, trail: string[]): void => {
        color.set(n, 1);
        for (const t of edges.get(n) ?? []) {
          if (color.get(t) === 1) {
            const loop = [...trail.slice(trail.indexOf(t) === -1 ? 0 : trail.indexOf(t)), n, t];
            const exit = loop.some((s) => isObj(states[s]) && states[s]["Type"] === "Choice");
            add(
              "warning",
              `${path}.States.${t}`,
              exit
                ? `is part of a loop (${loop.join(" -> ")}); make sure the Choice has a path out and a bound on iterations`
                : `is part of a loop with no Choice to leave it (${loop.join(" -> ")}): the execution would never finish`,
            );
          } else if (color.get(t) === undefined) walk(t, [...trail, n]);
        }
        color.set(n, 2);
      };
      walk(start, []);
    }
  };
  machine(definition, "$", topLanguage, 0);
  return issues;
}

/** Reads a definition out of a CloudFormation state machine resource, filling references with placeholders. */
export function definitionOf(properties: Obj): object | null {
  const value = properties["DefinitionString"] ?? properties["Definition"];
  if (isObj(value) && !("Fn::Join" in value) && !("Fn::Sub" in value)) return value;
  const text = flatten(value);
  if (text === null) return null;
  try {
    return JSON.parse(text) as object;
  } catch {
    return null;
  }
}

function flatten(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (isObj(value) && Array.isArray(value["Fn::Join"])) {
    const [sep, parts] = value["Fn::Join"] as [string, unknown[]];
    if (typeof sep !== "string" || !Array.isArray(parts)) return null;
    return parts
      .map((p) =>
        typeof p === "string"
          ? p
          : isObj(p) && Array.isArray(p["Fn::Join"])
            ? (flatten(p) ?? "")
            : placeholder(p),
      )
      .join(sep);
  }
  if (isObj(value) && typeof value["Fn::Sub"] === "string")
    return value["Fn::Sub"].replace(
      /\$\{([^}]+)\}/g,
      (_m, n: string) => `arn:aws:unresolved:::${n}`,
    );
  return null;
}

function placeholder(p: unknown): string {
  const id = isObj(p)
    ? typeof p["Ref"] === "string"
      ? p["Ref"]
      : Array.isArray(p["Fn::GetAtt"])
        ? String(p["Fn::GetAtt"][0])
        : "value"
    : "value";
  return `arn:aws:unresolved:::${id}`;
}
