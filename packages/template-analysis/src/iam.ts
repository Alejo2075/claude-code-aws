import type { Template } from "./types.js";

export interface PolicyStatement {
  owner: string;
  ownerType: string;
  /** `identity`: attached to a principal. `trust`: who may assume a role. `resource`: on a resource. */
  kind: "identity" | "trust" | "resource";
  effect: string;
  actions: string[];
  notActions: string[];
  resources: string[];
  notResources: string[];
  /** `*`, or `Type:value` such as `AWS:arn:...` or `Service:lambda.amazonaws.com`. */
  principals: string[];
  hasCondition: boolean;
  sid: string | null;
  /** Where it is, for evidence. */
  path: string;
}

/** Stands in for a value that is an intrinsic function or otherwise not a plain string. */
export const UNRESOLVED = "<unresolved>";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value))
    return value.map((entry) => (typeof entry === "string" ? entry : UNRESOLVED));
  return value === undefined ? [] : [UNRESOLVED];
}

function principals(value: unknown): string[] {
  if (value === "*") return ["*"];
  if (!isRecord(value)) return value === undefined ? [] : [UNRESOLVED];
  return Object.entries(value).flatMap(([type, inner]) =>
    strings(inner).map((entry) => `${type}:${entry}`),
  );
}

export const isWildcardPrincipal = (principal: string): boolean =>
  principal === "*" || principal === "AWS:*";

function fromDocument(
  document: unknown,
  base: Pick<PolicyStatement, "owner" | "ownerType" | "kind">,
  path: string,
): PolicyStatement[] {
  if (!isRecord(document)) return [];
  const raw = document["Statement"];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const out: PolicyStatement[] = [];
  list.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    out.push({
      ...base,
      effect: typeof entry["Effect"] === "string" ? entry["Effect"] : UNRESOLVED,
      actions: strings(entry["Action"]),
      notActions: strings(entry["NotAction"]),
      resources: strings(entry["Resource"]),
      notResources: strings(entry["NotResource"]),
      principals: principals(entry["Principal"]),
      hasCondition: isRecord(entry["Condition"]) && Object.keys(entry["Condition"]).length > 0,
      sid: typeof entry["Sid"] === "string" ? entry["Sid"] : null,
      path: `${path}/Statement/${index}`,
    });
  });
  return out;
}

/** Every IAM and resource-policy statement in the template. */
export function iamStatements(template: Template): PolicyStatement[] {
  const out: PolicyStatement[] = [];
  for (const resource of Object.values(template.resources)) {
    const { logicalId: owner, type: ownerType, properties } = resource;
    const at = `Resources/${owner}/Properties`;
    const identity = { owner, ownerType, kind: "identity" } as const;
    const resourcePolicy = { owner, ownerType, kind: "resource" } as const;
    switch (ownerType) {
      case "AWS::IAM::Role":
        out.push(
          ...fromDocument(
            properties["AssumeRolePolicyDocument"],
            { owner, ownerType, kind: "trust" },
            `${at}/AssumeRolePolicyDocument`,
          ),
        );
        if (Array.isArray(properties["Policies"])) {
          properties["Policies"].forEach((policy: unknown, index: number) => {
            if (isRecord(policy))
              out.push(
                ...fromDocument(
                  policy["PolicyDocument"],
                  identity,
                  `${at}/Policies/${index}/PolicyDocument`,
                ),
              );
          });
        }
        break;
      case "AWS::IAM::User":
      case "AWS::IAM::Group":
        if (Array.isArray(properties["Policies"])) {
          properties["Policies"].forEach((policy: unknown, index: number) => {
            if (isRecord(policy))
              out.push(
                ...fromDocument(
                  policy["PolicyDocument"],
                  identity,
                  `${at}/Policies/${index}/PolicyDocument`,
                ),
              );
          });
        }
        break;
      case "AWS::IAM::Policy":
      case "AWS::IAM::ManagedPolicy":
        out.push(...fromDocument(properties["PolicyDocument"], identity, `${at}/PolicyDocument`));
        break;
      case "AWS::SQS::QueuePolicy":
      case "AWS::SNS::TopicPolicy":
      case "AWS::S3::BucketPolicy":
        out.push(
          ...fromDocument(properties["PolicyDocument"], resourcePolicy, `${at}/PolicyDocument`),
        );
        break;
      case "AWS::SecretsManager::ResourcePolicy":
        out.push(
          ...fromDocument(properties["ResourcePolicy"], resourcePolicy, `${at}/ResourcePolicy`),
        );
        break;
      case "AWS::KMS::Key":
        out.push(...fromDocument(properties["KeyPolicy"], resourcePolicy, `${at}/KeyPolicy`));
        break;
      case "AWS::ApiGateway::RestApi":
        out.push(...fromDocument(properties["Policy"], resourcePolicy, `${at}/Policy`));
        break;
      case "AWS::ECR::Repository":
        out.push(
          ...fromDocument(
            properties["RepositoryPolicyText"],
            resourcePolicy,
            `${at}/RepositoryPolicyText`,
          ),
        );
        break;
      case "AWS::DynamoDB::Table":
        if (isRecord(properties["ResourcePolicy"])) {
          out.push(
            ...fromDocument(
              properties["ResourcePolicy"]["PolicyDocument"],
              resourcePolicy,
              `${at}/ResourcePolicy/PolicyDocument`,
            ),
          );
        }
        break;
      case "AWS::Lambda::Permission":
        out.push({
          ...resourcePolicy,
          effect: "Allow",
          actions: strings(properties["Action"]),
          notActions: [],
          resources: strings(properties["FunctionName"]),
          notResources: [],
          principals: strings(properties["Principal"]).map((entry) =>
            entry === "*" ? "*" : `Principal:${entry}`,
          ),
          hasCondition: [
            "SourceArn",
            "SourceAccount",
            "PrincipalOrgID",
            "FunctionUrlAuthType",
          ].some(
            (key) => properties[key] !== undefined && properties["FunctionUrlAuthType"] !== "NONE",
          ),
          sid: null,
          path: at,
        });
        break;
      default:
        break;
    }
  }
  return out;
}
