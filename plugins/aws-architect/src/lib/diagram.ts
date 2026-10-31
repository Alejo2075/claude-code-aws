// A Mermaid diagram from a synthesized template. Every link is labeled by how we know it:
// `declared` links are written in the template (an event source mapping, a notification, a route, a
// subscription, a rule target, a redrive policy); `inferred` links are read from permissions or
// environment variables, which show that a function *can* reach a resource, not that it does.
import { referencesIn, type ResourceInfo, type Template } from "@claude-code-aws/template-analysis";

export type LinkBasis = "declared" | "inferred";

export interface Link {
  from: string;
  to: string;
  label: string;
  basis: LinkBasis;
}

export interface Architecture {
  nodes: Array<{ id: string; type: string; label: string }>;
  links: Link[];
}

const SHOWN: Record<string, string> = {
  "AWS::Lambda::Function": "function",
  "AWS::SQS::Queue": "queue",
  "AWS::SNS::Topic": "topic",
  "AWS::DynamoDB::Table": "table",
  "AWS::S3::Bucket": "bucket",
  "AWS::ApiGatewayV2::Api": "http-api",
  "AWS::ApiGateway::RestApi": "rest-api",
  "AWS::StepFunctions::StateMachine": "state-machine",
  "AWS::Events::Rule": "rule",
  "AWS::Events::EventBus": "bus",
  "AWS::Cognito::UserPool": "user-pool",
  "AWS::SecretsManager::Secret": "secret",
  "AWS::KMS::Key": "key",
  "AWS::Kinesis::Stream": "stream",
};

const first = (value: unknown): string | null => {
  return referencesIn(value)[0]?.[0] ?? null;
};

function allRefs(value: unknown): string[] {
  return [...new Set(referencesIn(value).map(([id]) => id))];
}

const textOf = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Derives the architecture from a template. Resources that are not part of the picture are left out. */
export function architectureOf(template: Template): Architecture {
  const resources = template.resources;
  const shown = (id: string | null): id is string =>
    id !== null && resources[id] !== undefined && SHOWN[resources[id].type] !== undefined;
  const links: Link[] = [];
  const add = (from: string | null, to: string | null, label: string, basis: LinkBasis): void => {
    if (from === null || to === null || from === to || !shown(from) || !shown(to)) return;
    if (!links.some((link) => link.from === from && link.to === to && link.label === label))
      links.push({ from, to, label, basis });
  };
  const ofType = (...types: string[]): ResourceInfo[] =>
    Object.values(resources).filter((r) => types.includes(r.type));

  for (const queue of ofType("AWS::SQS::Queue")) {
    const redrive = queue.properties["RedrivePolicy"];
    if (isRecord(redrive))
      add(queue.logicalId, first(redrive["deadLetterTargetArn"]), "dead-letter", "declared");
  }
  for (const mapping of ofType("AWS::Lambda::EventSourceMapping")) {
    add(
      first(mapping.properties["EventSourceArn"]),
      first(mapping.properties["FunctionName"]),
      "event source",
      "declared",
    );
  }
  for (const custom of ofType("Custom::S3BucketNotifications")) {
    const bucket = first(custom.properties["BucketName"]);
    const config = custom.properties["NotificationConfiguration"];
    if (!isRecord(config)) continue;
    for (const key of [
      "QueueConfigurations",
      "TopicConfigurations",
      "LambdaFunctionConfigurations",
    ]) {
      const list = config[key];
      if (Array.isArray(list))
        for (const entry of list)
          add(
            bucket,
            first(
              isRecord(entry)
                ? (entry["QueueArn"] ?? entry["TopicArn"] ?? entry["LambdaFunctionArn"])
                : null,
            ),
            "object event",
            "declared",
          );
    }
  }
  for (const subscription of ofType("AWS::SNS::Subscription"))
    add(
      first(subscription.properties["TopicArn"]),
      first(subscription.properties["Endpoint"]),
      "subscription",
      "declared",
    );
  for (const rule of ofType("AWS::Events::Rule")) {
    const targets = rule.properties["Targets"];
    if (Array.isArray(targets))
      for (const target of targets)
        add(
          rule.logicalId,
          first(isRecord(target) ? target["Arn"] : null),
          "rule target",
          "declared",
        );
  }
  // HTTP API: route -> integration -> function.
  const integrationTarget = new Map<string, string | null>();
  for (const integration of ofType("AWS::ApiGatewayV2::Integration"))
    integrationTarget.set(integration.logicalId, first(integration.properties["IntegrationUri"]));
  for (const route of ofType("AWS::ApiGatewayV2::Route")) {
    const integration = allRefs(route.properties["Target"]).find((id) => integrationTarget.has(id));
    if (integration !== undefined)
      add(
        first(route.properties["ApiId"]),
        integrationTarget.get(integration) ?? null,
        textOf(route.properties["RouteKey"], "route"),
        "declared",
      );
  }
  for (const method of ofType("AWS::ApiGateway::Method")) {
    const integration = method.properties["Integration"];
    add(
      first(method.properties["RestApiId"]),
      isRecord(integration) ? first(integration["Uri"]) : null,
      textOf(method.properties["HttpMethod"], "method"),
      "declared",
    );
  }
  // Inferred: environment variables and the permissions of the function's role.
  const rolePolicies = new Map<string, string[]>();
  for (const policy of ofType("AWS::IAM::Policy", "AWS::IAM::ManagedPolicy")) {
    const targets = allRefs(policy.properties["PolicyDocument"]).filter(shown);
    for (const role of allRefs(policy.properties["Roles"]))
      rolePolicies.set(role, [...(rolePolicies.get(role) ?? []), ...targets]);
  }
  for (const fn of ofType("AWS::Lambda::Function")) {
    for (const id of allRefs(fn.properties["Environment"]))
      add(fn.logicalId, id, "environment reference", "inferred");
    for (const role of allRefs(fn.properties["Role"]))
      for (const id of rolePolicies.get(role) ?? [])
        add(fn.logicalId, id, "permitted by IAM", "inferred");
  }
  const used = new Set(links.flatMap((link) => [link.from, link.to]));
  const nodes = Object.values(resources)
    .filter(
      (r) =>
        SHOWN[r.type] !== undefined &&
        (used.has(r.logicalId) ||
          r.type === "AWS::Lambda::Function" ||
          r.type === "AWS::DynamoDB::Table" ||
          r.type === "AWS::SQS::Queue"),
    )
    .map((r) => ({
      id: r.logicalId,
      type: SHOWN[r.type] ?? r.type,
      label: r.logicalId.replace(/[0-9A-F]{8}$/, ""),
    }));
  return { nodes, links };
}

const mermaidText = (text: string): string => text.replace(/["\n\r]/g, " ").slice(0, 60);

/** Mermaid flowchart: solid arrows are declared in the template, dotted ones are inferred. */
export function toMermaid(architecture: Architecture): string {
  const ids = new Map(architecture.nodes.map((node, index) => [node.id, `n${index}`]));
  const lines = ["flowchart LR"];
  for (const node of architecture.nodes)
    lines.push(`  ${ids.get(node.id)}["${mermaidText(node.type)}: ${mermaidText(node.label)}"]`);
  for (const link of architecture.links) {
    const from = ids.get(link.from);
    const to = ids.get(link.to);
    if (from === undefined || to === undefined) continue;
    lines.push(
      link.basis === "declared"
        ? `  ${from} -->|"${mermaidText(link.label)}"| ${to}`
        : `  ${from} -.->|"${mermaidText(link.label)} (inferred)"| ${to}`,
    );
  }
  return lines.join("\n");
}
