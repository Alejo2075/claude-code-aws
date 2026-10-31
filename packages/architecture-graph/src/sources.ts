import type { ArchitecturePlan } from "@claude-code-aws/report-contract";
import { referencesIn, type ResourceInfo, type Template } from "@claude-code-aws/template-analysis";

import { type ArchitectureGraph, type Basis, emptyGraph, type GraphEdge } from "./model.js";

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
  "AWS::CloudFront::Distribution": "distribution",
  "AWS::AppSync::GraphQLApi": "graphql-api",
  "AWS::KinesisFirehose::DeliveryStream": "delivery-stream",
  "AWS::ECS::Service": "ecs-service",
  "AWS::SES::EmailIdentity": "email-identity",
};

const first = (value: unknown): string | null => referencesIn(value)[0]?.[0] ?? null;
const allRefs = (value: unknown): string[] => [...new Set(referencesIn(value).map(([id]) => id))];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const textOf = (value: unknown, fallback: string): string =>
  typeof value === "string" ? value : fallback;

/** Nodes and edges that one synthesized template declares or implies. */
export function fromTemplate(template: Template, group?: string, prefix = ""): ArchitectureGraph {
  const resources = template.resources;
  const graph = emptyGraph("Architecture");
  const shown = (id: string | null): id is string =>
    id !== null && resources[id] !== undefined && SHOWN[resources[id].type] !== undefined;
  const add = (from: string | null, to: string | null, label: string, basis: Basis): void => {
    if (from === null || to === null || from === to || !shown(from) || !shown(to)) return;
    if (
      !graph.edges.some(
        (e) => e.from === prefix + from && e.to === prefix + to && e.label === label,
      )
    ) {
      const edge: GraphEdge = { from: prefix + from, to: prefix + to, label, basis };
      graph.edges.push(edge);
    }
  };
  const ofType = (...types: string[]): ResourceInfo[] =>
    Object.values(resources).filter((r) => types.includes(r.type));

  for (const queue of ofType("AWS::SQS::Queue")) {
    const redrive = queue.properties["RedrivePolicy"];
    if (isRecord(redrive))
      add(queue.logicalId, first(redrive["deadLetterTargetArn"]), "dead-letter", "declared");
  }
  for (const m of ofType("AWS::Lambda::EventSourceMapping"))
    add(
      first(m.properties["EventSourceArn"]),
      first(m.properties["FunctionName"]),
      "event source",
      "declared",
    );
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
  for (const s of ofType("AWS::SNS::Subscription"))
    add(
      first(s.properties["TopicArn"]),
      first(s.properties["Endpoint"]),
      "subscription",
      "declared",
    );
  for (const rule of ofType("AWS::Events::Rule")) {
    const targets = rule.properties["Targets"];
    if (Array.isArray(targets))
      for (const t of targets)
        add(rule.logicalId, first(isRecord(t) ? t["Arn"] : null), "rule target", "declared");
  }
  const integrationTarget = new Map<string, string | null>();
  for (const i of ofType("AWS::ApiGatewayV2::Integration"))
    integrationTarget.set(i.logicalId, first(i.properties["IntegrationUri"]));
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
  for (const dist of ofType("AWS::CloudFront::Distribution")) {
    const config = dist.properties["DistributionConfig"];
    const origins = isRecord(config) ? config["Origins"] : null;
    if (Array.isArray(origins))
      for (const o of origins)
        add(dist.logicalId, first(isRecord(o) ? o["DomainName"] : null), "origin", "declared");
  }
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
  const used = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  graph.nodes = Object.values(resources)
    .filter(
      (r) =>
        SHOWN[r.type] !== undefined &&
        (used.has(prefix + r.logicalId) ||
          ["AWS::Lambda::Function", "AWS::DynamoDB::Table", "AWS::SQS::Queue"].includes(r.type)),
    )
    .map((r) => ({
      id: prefix + r.logicalId,
      kind: SHOWN[r.type] ?? r.type,
      label: r.logicalId.replace(/[0-9A-F]{8}$/, ""),
      basis: "declared" as const,
      ...(group === undefined ? {} : { group }),
    }));
  return graph;
}

/** Several stacks in one graph; each stack is a group and node ids carry the stack name. */
export function fromStacks(
  stacks: ReadonlyArray<{ name: string; template: Template }>,
): ArchitectureGraph {
  const graph = emptyGraph("Architecture");
  for (const stack of stacks) {
    const part = fromTemplate(stack.template, stack.name, `${stack.name}/`);
    graph.nodes.push(...part.nodes);
    graph.edges.push(...part.edges);
  }
  return graph;
}

/** A plan's components and integrations. Nothing exists yet, so everything is `intended`. */
export function fromPlan(plan: ArchitecturePlan): ArchitectureGraph {
  return {
    schemaVersion: "1",
    title: plan.title,
    nodes: plan.components.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.name,
      basis: "intended" as const,
    })),
    edges: plan.integrations.map((i) => ({
      from: i.from,
      to: i.to,
      label: i.note === undefined ? i.style : `${i.style}: ${i.note}`,
      basis: "intended" as const,
    })),
    notes: ["Intended design: nothing here is deployed or declared in code."],
  };
}

export interface Inventory {
  resources: Array<{ id: string; kind: string; name: string; account?: string; region?: string }>;
  relations: Array<{ from: string; to: string; label: string; observed?: boolean }>;
}

/** A listed inventory (for example from aws-explorer). Resources are `deployed`; seen relations `observed`. Accounts and regions become groups. */
export function fromInventory(inventory: Inventory): ArchitectureGraph {
  return {
    schemaVersion: "1",
    title: "Deployed inventory",
    nodes: inventory.resources.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.name,
      basis: "deployed" as const,
      ...(r.account === undefined && r.region === undefined
        ? {}
        : { group: [r.account, r.region].filter((p) => p !== undefined).join(" / ") }),
    })),
    edges: inventory.relations.map((r) => ({
      from: r.from,
      to: r.to,
      label: r.label,
      basis: r.observed === true ? ("observed" as const) : ("inferred" as const),
    })),
    notes: [
      "Resources come from the supplied inventory. A relation is observed only if the inventory says so; others are inferred and may not match real traffic.",
    ],
  };
}

interface AslState {
  Type?: unknown;
  Next?: unknown;
  Default?: unknown;
  Choices?: unknown;
  Catch?: unknown;
  Branches?: unknown;
  ItemProcessor?: unknown;
  Iterator?: unknown;
  End?: unknown;
}

/** The state graph of an Amazon States Language definition, including Parallel branches and Map processors. */
export function fromStateMachine(definition: unknown, title = "State machine"): ArchitectureGraph {
  const graph = emptyGraph(title);
  let budget = 400;
  const walk = (def: unknown, prefix: string, group: string): string | null => {
    if (!isRecord(def) || !isRecord(def["States"]) || budget <= 0) return null;
    const states = def["States"];
    for (const [name, raw] of Object.entries(states)) {
      if (budget-- <= 0) break;
      const state = (isRecord(raw) ? raw : {}) as AslState;
      graph.nodes.push({
        id: prefix + name,
        kind: textOf(state.Type, "State").toLowerCase(),
        label: name,
        basis: "declared",
        group,
      });
      const edge = (to: unknown, label: string): void => {
        if (typeof to === "string")
          graph.edges.push({ from: prefix + name, to: prefix + to, label, basis: "declared" });
      };
      edge(state.Next, "next");
      edge(state.Default, "default");
      if (Array.isArray(state.Choices))
        for (const c of state.Choices) edge(isRecord(c) ? c["Next"] : null, "choice");
      if (Array.isArray(state.Catch))
        for (const c of state.Catch) edge(isRecord(c) ? c["Next"] : null, "catch");
      const nested: unknown[] = Array.isArray(state.Branches)
        ? [...(state.Branches as unknown[])]
        : [];
      const processor = state.ItemProcessor ?? state.Iterator;
      if (processor !== undefined) nested.push(processor);
      nested.forEach((sub, i) => {
        const start = walk(sub, `${prefix}${name}.${i}.`, `${group} > ${name}`);
        if (start !== null)
          graph.edges.push({
            from: prefix + name,
            to: start,
            label: "contains",
            basis: "declared",
          });
      });
    }
    return typeof def["StartAt"] === "string" ? prefix + def["StartAt"] : null;
  };
  const start = walk(definition, "", title);
  if (start !== null) graph.notes.push(`Starts at ${start}.`);
  graph.nodes = graph.nodes.filter((n) => n.id !== "");
  return graph;
}
