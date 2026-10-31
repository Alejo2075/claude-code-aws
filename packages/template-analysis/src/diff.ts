import type { ChangeAction, TemplateChange } from "@claude-code-aws/report-contract";

import {
  constrainedProperties,
  isKnownType,
  isStateful,
  replacementProperties,
  statefulReason,
  SUPPLEMENT_NOTE,
} from "./catalog.js";
import { isRetained } from "./template.js";
import type { ResourceInfo, Template } from "./types.js";

const IGNORED_TYPES = new Set(["AWS::CDK::Metadata"]);
const RENAME_SIMILARITY = 0.8;

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(",")}}`;
}

function changedProperties(before: ResourceInfo, after: ResourceInfo): string[] {
  const keys = new Set([...Object.keys(before.properties), ...Object.keys(after.properties)]);
  const changed = [...keys].filter(
    (key) => canonical(before.properties[key]) !== canonical(after.properties[key]),
  );
  if (before.deletionPolicy !== after.deletionPolicy) changed.push("DeletionPolicy");
  if (before.updateReplacePolicy !== after.updateReplacePolicy) changed.push("UpdateReplacePolicy");
  return changed.sort();
}

function similarity(a: ResourceInfo, b: ResourceInfo): number {
  const keys = new Set([...Object.keys(a.properties), ...Object.keys(b.properties)]);
  if (keys.size === 0) return 0;
  let same = 0;
  for (const key of keys)
    if (canonical(a.properties[key]) === canonical(b.properties[key])) same += 1;
  return same / keys.size;
}

function classify(
  before: ResourceInfo,
  after: ResourceInfo,
  properties: string[],
): Pick<TemplateChange, "action" | "note"> {
  if (before.type !== after.type) {
    return {
      action: "replace",
      note: `The resource type changed from ${before.type} to ${after.type}.`,
    };
  }
  const type = after.type;
  if (type.startsWith("Custom::") || type === "AWS::CloudFormation::CustomResource") {
    return {
      action: "unknown",
      note: "Custom resource: the effect depends on its handler, which this analysis cannot see.",
    };
  }
  const createOnly = replacementProperties(type);
  if (createOnly !== null) {
    const replaced = properties.filter((property) => createOnly.includes(property));
    if (replaced.length > 0) {
      return {
        action: "replace",
        note: `Changing ${replaced.join(", ")} replaces the resource (CloudFormation resource schema). If the resolved value is unchanged, there is no replacement: a change set confirms.`,
      };
    }
    const nested = properties.filter((property) =>
      createOnly.some((path) => path.startsWith(`${property}/`)),
    );
    if (nested.length > 0) {
      return {
        action: "possible-replace",
        note: `A nested part of ${nested.join(", ")} is create-only. A change set confirms.`,
      };
    }
    const constrained = properties.filter((property) =>
      constrainedProperties(type).includes(property),
    );
    if (constrained.length > 0) {
      return { action: "possible-replace", note: `${constrained.join(", ")}: ${SUPPLEMENT_NOTE}` };
    }
    return { action: "update" };
  }
  return isKnownType(type)
    ? { action: "update" }
    : {
        action: "unknown",
        note: "This resource type is not in the replacement catalog, so whether the change replaces it is unknown.",
      };
}

/** Compares two templates resource by resource. This is a template comparison, not a change set. */
export function diffTemplates(before: Template, after: Template): TemplateChange[] {
  const changes: TemplateChange[] = [];
  const created = Object.values(after.resources).filter(
    (r) => before.resources[r.logicalId] === undefined && !IGNORED_TYPES.has(r.type),
  );
  const deleted = Object.values(before.resources).filter(
    (r) => after.resources[r.logicalId] === undefined && !IGNORED_TYPES.has(r.type),
  );

  // A delete and a create of the same type with near-identical properties is most likely a rename
  // (a changed construct id changes the logical id), which CloudFormation executes as delete + create.
  const renamed = new Map<string, string>();
  for (const gone of deleted) {
    let best: { id: string; score: number } | null = null;
    for (const fresh of created) {
      if (fresh.type !== gone.type || [...renamed.values()].includes(fresh.logicalId)) continue;
      const score = similarity(gone, fresh);
      if (score >= RENAME_SIMILARITY && (best === null || score > best.score))
        best = { id: fresh.logicalId, score };
    }
    if (best !== null) renamed.set(gone.logicalId, best.id);
  }

  for (const resource of created) {
    const from = [...renamed.entries()].find(([, to]) => to === resource.logicalId)?.[0];
    changes.push({
      logicalId: resource.logicalId,
      resourceType: resource.type,
      action: "create",
      properties: [],
      stateful: isStateful(resource.type),
      ...(from === undefined
        ? {}
        : {
            note: `Possible rename of ${from}: a ${resource.type} with nearly identical properties is deleted. CloudFormation creates this one new and ${isRetained(before.resources[from] as ResourceInfo) ? "keeps" : "deletes"} the old one.`,
          }),
    });
  }
  for (const resource of deleted) {
    const to = renamed.get(resource.logicalId);
    const retained = isRetained(resource);
    const reason = statefulReason(resource.type);
    changes.push({
      logicalId: resource.logicalId,
      resourceType: resource.type,
      action: "delete",
      properties: [],
      stateful: isStateful(resource.type),
      retained,
      ...(to !== undefined || reason !== null
        ? {
            note: [
              to !== undefined ? `Possible rename to ${to}.` : null,
              reason !== null
                ? `It ${reason}; ${retained ? "its Retain policy keeps the physical resource" : "deleting it loses that unless it is backed up"}.`
                : null,
            ]
              .filter((part) => part !== null)
              .join(" "),
          }
        : {}),
    });
  }
  for (const resource of Object.values(after.resources)) {
    const previous = before.resources[resource.logicalId];
    if (previous === undefined || IGNORED_TYPES.has(resource.type)) continue;
    const properties = changedProperties(previous, resource);
    if (properties.length === 0) continue;
    const verdict = classify(previous, resource, properties);
    const replaced = verdict.action === "replace" || verdict.action === "possible-replace";
    const reason = statefulReason(resource.type);
    changes.push({
      logicalId: resource.logicalId,
      resourceType: resource.type,
      action: verdict.action,
      properties,
      stateful: isStateful(resource.type),
      ...(replaced ? { retained: previous.updateReplacePolicy === "Retain" } : {}),
      ...(verdict.note !== undefined || (replaced && reason !== null)
        ? {
            note: [
              verdict.note ?? null,
              replaced && reason !== null
                ? `It ${reason}; a replacement ${previous.updateReplacePolicy === "Retain" ? "keeps the old physical resource (UpdateReplacePolicy Retain) but starts a new empty one" : "can lose that data unless it is migrated"}.`
                : null,
            ]
              .filter((part) => part !== null)
              .join(" "),
          }
        : {}),
    });
  }
  const ORDER: Record<ChangeAction, number> = {
    replace: 0,
    delete: 1,
    "possible-replace": 2,
    unknown: 3,
    update: 4,
    create: 5,
  };
  return changes.sort(
    (a, b) => ORDER[a.action] - ORDER[b.action] || a.logicalId.localeCompare(b.logicalId),
  );
}

export function summarizeChanges(
  changes: readonly TemplateChange[],
): Record<"create" | "update" | "replace" | "possibleReplace" | "delete" | "unknown", number> {
  const count = (action: ChangeAction): number =>
    changes.filter((change) => change.action === action).length;
  return {
    create: count("create"),
    update: count("update"),
    replace: count("replace"),
    possibleReplace: count("possible-replace"),
    delete: count("delete"),
    unknown: count("unknown"),
  };
}
