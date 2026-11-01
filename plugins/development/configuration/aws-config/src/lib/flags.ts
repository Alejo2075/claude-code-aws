// Validation of the AWS.AppConfig.FeatureFlags document, following the type reference schema:
// version, flags (name pattern, up to 25 attributes with constraints), and values.
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const NAME = /^[a-z][a-zA-Z\d_-]{0,63}$/;

export interface Issue {
  level: "error" | "warning";
  path: string;
  message: string;
}

function checkConstraint(
  c: unknown,
  path: string,
  add: (l: Issue["level"], p: string, m: string) => void,
): string | null {
  if (!isObj(c)) return null;
  const type = c["type"];
  if (!["string", "number", "boolean", "array"].includes(typeof type === "string" ? type : "")) {
    add("error", `${path}.type`, "constraint type must be string, number, boolean, or array");
    return null;
  }
  if (type === "string") {
    if ("pattern" in c && "enum" in c)
      add("error", path, "a string constraint cannot have both pattern and enum");
    if (typeof c["pattern"] === "string") {
      if (c["pattern"].length > 1024)
        add("error", `${path}.pattern`, "pattern is longer than 1024 characters");
      try {
        new RegExp(c["pattern"]);
      } catch {
        add("error", `${path}.pattern`, "pattern is not a valid regular expression");
      }
    }
    if (Array.isArray(c["enum"]) && c["enum"].length > 100)
      add("error", `${path}.enum`, "enum has more than 100 values");
  }
  if (type === "number")
    for (const k of ["minimum", "maximum"])
      if (k in c && !Number.isInteger(c[k])) add("error", `${path}.${k}`, "must be an integer");
  return type as string;
}

function checkValue(
  v: unknown,
  c: Obj,
  path: string,
  add: (l: Issue["level"], p: string, m: string) => void,
): void {
  const type = c["type"];
  if (type === "string") {
    if (typeof v !== "string") {
      add("error", path, "must be a string");
      return;
    }
    if (v.length > 1024) add("error", path, "is longer than 1024 characters");
    if (Array.isArray(c["enum"]) && !c["enum"].includes(v))
      add("error", path, `must be one of ${JSON.stringify(c["enum"])}`);
    if (typeof c["pattern"] === "string" && c["pattern"].length <= 1024) {
      try {
        if (!new RegExp(c["pattern"]).test(v))
          add("error", path, `does not match the pattern ${c["pattern"]}`);
      } catch {
        // An invalid pattern is reported on the definition.
      }
    }
  } else if (type === "number") {
    if (typeof v !== "number") {
      add("error", path, "must be a number");
      return;
    }
    if (typeof c["minimum"] === "number" && v < c["minimum"])
      add("error", path, `is below the minimum ${c["minimum"]}`);
    if (typeof c["maximum"] === "number" && v > c["maximum"])
      add("error", path, `is above the maximum ${c["maximum"]}`);
  } else if (type === "boolean") {
    if (typeof v !== "boolean") add("error", path, "must be a boolean");
  } else if (type === "array") {
    if (!Array.isArray(v)) {
      add("error", path, "must be a list");
      return;
    }
    const el = isObj(c["elements"]) ? c["elements"] : null;
    if (el !== null)
      v.forEach((x, i) => {
        checkValue(x, el, `${path}[${i}]`, add);
      });
  }
}

export function validateFlags(doc: unknown): Issue[] {
  const issues: Issue[] = [];
  const add = (level: Issue["level"], path: string, message: string): void => {
    issues.push({ level, path, message });
  };
  if (!isObj(doc))
    return [
      { level: "error", path: "$", message: "must be an object with version, flags, and values" },
    ];
  for (const k of Object.keys(doc))
    if (!["version", "flags", "values"].includes(k))
      add("error", `$.${k}`, "is not allowed at the top level (only version, flags, values)");
  if (doc["version"] === undefined) add("error", "$.version", "is required");
  const flags = isObj(doc["flags"]) ? doc["flags"] : {};
  const values = isObj(doc["values"]) ? doc["values"] : {};
  const defs = new Map<string, Obj>();
  for (const [name, flag] of Object.entries(flags)) {
    const here = `$.flags.${name}`;
    if (!NAME.test(name))
      add(
        "error",
        here,
        "name must start with a lowercase letter and use letters, digits, _ or -, up to 64 characters",
      );
    if (!isObj(flag)) {
      add("error", here, "must be an object");
      continue;
    }
    for (const k of Object.keys(flag))
      if (
        !["name", "description", "_createdAt", "_updatedAt", "_deprecation", "attributes"].includes(
          k,
        )
      )
        add("error", `${here}.${k}`, "is not a valid flag property");
    const attrs = isObj(flag["attributes"]) ? flag["attributes"] : {};
    if (Object.keys(attrs).length > 25)
      add("error", `${here}.attributes`, "has more than 25 attributes");
    const cmap: Obj = {};
    for (const [an, a] of Object.entries(attrs)) {
      if (!NAME.test(an)) add("error", `${here}.attributes.${an}`, "attribute name is not valid");
      if (
        isObj(a) &&
        isObj(a["constraints"]) &&
        checkConstraint(a["constraints"], `${here}.attributes.${an}.constraints`, add) !== null
      )
        cmap[an] = a["constraints"];
    }
    defs.set(name, cmap);
  }
  for (const [name, val] of Object.entries(values)) {
    const here = `$.values.${name}`;
    if (!defs.has(name)) {
      add("error", here, "has a value but no flag definition");
      continue;
    }
    if (!isObj(val)) {
      add("error", here, "must be an object");
      continue;
    }
    if (typeof val["enabled"] !== "boolean")
      add("error", `${here}.enabled`, "must be true or false");
    const cmap = defs.get(name) ?? {};
    for (const [an, c] of Object.entries(cmap)) {
      const attrDef = c as Obj;
      if (!(an in val)) {
        if (attrDef["required"] === true)
          add("error", `${here}.${an}`, "is required by its constraint but missing");
        continue;
      }
      checkValue(val[an], attrDef, `${here}.${an}`, add);
    }
    for (const k of Object.keys(val))
      if (!["enabled", "_createdAt", "_updatedAt", "_variants"].includes(k) && !(k in cmap))
        add("warning", `${here}.${k}`, "has no attribute definition, so nothing constrains it");
  }
  for (const name of defs.keys())
    if (!(name in values))
      add(
        "warning",
        `$.flags.${name}`,
        "has no value: it cannot be enabled until a value is deployed",
      );
  return issues;
}
