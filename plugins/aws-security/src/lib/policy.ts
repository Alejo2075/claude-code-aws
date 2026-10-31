// Reads standalone policy documents (pasted JSON) with the same statement model as templates.
import {
  iamStatements,
  parseTemplate,
  type PolicyStatement,
  type Template,
} from "@claude-code-aws/template-analysis";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type PolicyKind = PolicyStatement["kind"];

/** A one-resource template that carries a pasted policy, so the same readers and rules apply. */
export function policyTemplate(
  text: string,
  kind: PolicyKind = "identity",
): { template: Template | null; error: string | null } {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { template: null, error: "The policy is not valid JSON." };
  }
  let document = value;
  if (isRecord(value) && isRecord(value["PolicyDocument"])) document = value["PolicyDocument"];
  if (
    isRecord(value) &&
    isRecord(value["PolicyVersion"]) &&
    isRecord(value["PolicyVersion"]["Document"])
  )
    document = value["PolicyVersion"]["Document"];
  if (!isRecord(document) || document["Statement"] === undefined)
    return { template: null, error: "No Statement was found in the policy." };
  const type =
    kind === "trust"
      ? "AWS::IAM::Role"
      : kind === "resource"
        ? "AWS::S3::BucketPolicy"
        : "AWS::IAM::ManagedPolicy";
  const property = kind === "trust" ? "AssumeRolePolicyDocument" : "PolicyDocument";
  const parsed = parseTemplate({
    Resources: { Policy: { Type: type, Properties: { [property]: document } } },
  });
  return parsed.ok
    ? { template: parsed.template, error: null }
    : { template: null, error: parsed.error };
}

export function statementsOf(template: Template): PolicyStatement[] {
  return iamStatements(template);
}

export function describeStatement(statement: PolicyStatement): string {
  const who = statement.principals.length > 0 ? ` for ${statement.principals.join(", ")}` : "";
  const what =
    statement.actions.length > 0
      ? statement.actions.join(", ")
      : `NotAction ${statement.notActions.join(", ")}`;
  const where =
    statement.resources.length > 0
      ? statement.resources.join(", ")
      : statement.notResources.length > 0
        ? `NotResource ${statement.notResources.join(", ")}`
        : "-";
  return `${statement.effect} ${what} on ${where}${who}${statement.hasCondition ? " (with a condition)" : ""}`;
}
