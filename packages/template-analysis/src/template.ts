import type { ParseResult, ResourceInfo, Template } from "./types.js";

export const MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;
export const MAX_RESOURCES = 5000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function names(value: unknown): string[] {
  if (typeof value === "string") return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

/** Parses a CloudFormation template given as JSON text or as an already parsed object. */
export function parseTemplate(source: unknown): ParseResult {
  let document: unknown = source;
  if (typeof source === "string") {
    if (source.length > MAX_TEMPLATE_BYTES) return { ok: false, error: "template is too large" };
    try {
      document = JSON.parse(source);
    } catch {
      return { ok: false, error: "template is not valid JSON (YAML templates are not supported)" };
    }
  }
  if (!isRecord(document)) return { ok: false, error: "template must be a JSON object" };
  const resourcesValue = document["Resources"];
  if (!isRecord(resourcesValue)) return { ok: false, error: "template has no Resources section" };
  const ids = Object.keys(resourcesValue);
  if (ids.length > MAX_RESOURCES) return { ok: false, error: "template has too many resources" };

  const resources: Record<string, ResourceInfo> = {};
  for (const logicalId of ids) {
    const entry = resourcesValue[logicalId];
    if (!isRecord(entry) || typeof entry["Type"] !== "string") {
      return { ok: false, error: `resource ${logicalId} has no Type` };
    }
    resources[logicalId] = {
      logicalId,
      type: entry["Type"],
      properties: isRecord(entry["Properties"]) ? entry["Properties"] : {},
      deletionPolicy: stringOrNull(entry["DeletionPolicy"]),
      updateReplacePolicy: stringOrNull(entry["UpdateReplacePolicy"]),
      dependsOn: names(entry["DependsOn"]),
      condition: stringOrNull(entry["Condition"]),
      metadata: isRecord(entry["Metadata"]) ? entry["Metadata"] : {},
    };
  }
  return {
    ok: true,
    template: {
      resources,
      parameters: isRecord(document["Parameters"]) ? document["Parameters"] : {},
      outputs: isRecord(document["Outputs"]) ? document["Outputs"] : {},
      conditions: isRecord(document["Conditions"]) ? document["Conditions"] : {},
      raw: document,
    },
  };
}

export function resourcesOfType(template: Template, ...types: string[]): ResourceInfo[] {
  return Object.values(template.resources).filter((resource) => types.includes(resource.type));
}

/** Resources a Retain policy keeps alive when the stack deletes or replaces them. */
export function isRetained(resource: ResourceInfo): boolean {
  return resource.deletionPolicy === "Retain" || resource.deletionPolicy === "RetainExceptOnCreate";
}
