// A small subset of JSON Schema for free-form configuration: type, required, properties,
// additionalProperties:false, enum, minimum/maximum, minLength/maxLength, pattern, items, minItems/maxItems.
// AppConfig's own JSON Schema validators accept more; this is a local first check.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateAgainst(data: unknown, schema: unknown, path = "$", depth = 0): string[] {
  const out: string[] = [];
  if (depth > 20 || !isObj(schema)) return out;
  const type = schema["type"];
  const actual =
    data === null
      ? "null"
      : Array.isArray(data)
        ? "array"
        : typeof data === "number"
          ? Number.isInteger(data)
            ? "integer"
            : "number"
          : typeof data;
  if (typeof type === "string") {
    const ok = type === actual || (type === "number" && actual === "integer");
    if (!ok) return [`${path}: expected ${type}, got ${actual}`];
  }
  if (
    Array.isArray(schema["enum"]) &&
    !schema["enum"].some((e) => JSON.stringify(e) === JSON.stringify(data))
  )
    out.push(`${path}: must be one of ${JSON.stringify(schema["enum"])}`);
  if (typeof data === "number") {
    if (typeof schema["minimum"] === "number" && data < schema["minimum"])
      out.push(`${path}: ${data} is below the minimum ${schema["minimum"]}`);
    if (typeof schema["maximum"] === "number" && data > schema["maximum"])
      out.push(`${path}: ${data} is above the maximum ${schema["maximum"]}`);
  }
  if (typeof data === "string") {
    if (typeof schema["minLength"] === "number" && data.length < schema["minLength"])
      out.push(`${path}: shorter than ${schema["minLength"]}`);
    if (typeof schema["maxLength"] === "number" && data.length > schema["maxLength"])
      out.push(`${path}: longer than ${schema["maxLength"]}`);
    if (
      typeof schema["pattern"] === "string" &&
      schema["pattern"].length <= 500 &&
      data.length <= 10_000
    ) {
      try {
        if (!new RegExp(schema["pattern"]).test(data))
          out.push(`${path}: does not match ${schema["pattern"]}`);
      } catch {
        out.push(`${path}: the schema pattern is not a valid regular expression`);
      }
    }
  }
  if (Array.isArray(data)) {
    if (typeof schema["minItems"] === "number" && data.length < schema["minItems"])
      out.push(`${path}: fewer than ${schema["minItems"]} items`);
    if (typeof schema["maxItems"] === "number" && data.length > schema["maxItems"])
      out.push(`${path}: more than ${schema["maxItems"]} items`);
    if (isObj(schema["items"]))
      data
        .slice(0, 1000)
        .forEach((x, i) =>
          out.push(...validateAgainst(x, schema["items"], `${path}[${i}]`, depth + 1)),
        );
  }
  if (isObj(data)) {
    if (Array.isArray(schema["required"]))
      for (const r of schema["required"])
        if (typeof r === "string" && !(r in data)) out.push(`${path}.${r}: is required`);
    const props = isObj(schema["properties"]) ? schema["properties"] : {};
    for (const [k, sub] of Object.entries(props))
      if (k in data) out.push(...validateAgainst(data[k], sub, `${path}.${k}`, depth + 1));
    if (schema["additionalProperties"] === false)
      for (const k of Object.keys(data))
        if (!(k in props)) out.push(`${path}.${k}: is not allowed`);
  }
  return out;
}

export interface Step {
  minute: number;
  percent: number;
}

export interface RolloutPlan {
  steps: Step[];
  completeAtMinute: number;
  bakeUntilMinute: number;
  notes: string[];
}

/** Timeline for a deployment strategy. Linear follows the documented example (growth factor percent per even interval); the interval spacing for exponential growth is an assumption, stated in the notes. */
export function rolloutPlan(
  type: "linear" | "exponential",
  growth: number,
  durationMinutes: number,
  bakeMinutes: number,
): RolloutPlan {
  const percents: number[] = [];
  if (type === "linear")
    for (let p = growth; ; p += growth) {
      percents.push(Math.min(100, p));
      if (p >= 100) break;
    }
  else
    for (let n = 0; ; n += 1) {
      const p = growth * 2 ** n;
      percents.push(Math.min(100, p));
      if (p >= 100) break;
    }
  const interval = durationMinutes / percents.length;
  const steps = percents.map((p, i) => ({
    minute: Math.round(interval * (i + 1) * 100) / 100,
    percent: p,
  }));
  return {
    steps,
    completeAtMinute: durationMinutes,
    bakeUntilMinute: durationMinutes + bakeMinutes,
    notes: [
      type === "linear"
        ? "Linear: each step adds the growth factor, spread evenly over the deployment time (matches the documentation's 10-hour, 20% example)."
        : "Exponential: the share is growth * 2^N (2, 4, 8, ... percent for a growth factor of 2). Spacing the steps evenly over the deployment time is an assumption of this tool.",
      "Deployment time is a window in which the rollout is processed, not a timeout.",
      bakeMinutes > 0
        ? `Bake time: AppConfig watches the environment's CloudWatch alarms for ${bakeMinutes} more minute(s) after 100% and rolls back if one fires. That needs alarms attached to the environment and a role that lets AppConfig read them.`
        : "No bake time: after 100%, a bad value is not rolled back automatically.",
      "Entity-based gradual deployments (a user keeps the version they first got) need a recent AppConfig Agent; check the documentation.",
    ],
  };
}
