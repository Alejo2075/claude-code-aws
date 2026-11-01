import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/lib/cli.ts
import { isAbsolute as isAbsolute4, resolve as resolve4 } from "node:path";

// ../../../packages/architecture-graph/src/diff.ts
var edgeKey = (e) => `${e.from}\0${e.to}\0${e.label}`;
function diffGraphs(before, after) {
  const b = new Map(before.nodes.map((n) => [n.id, n]));
  const a = new Map(after.nodes.map((n) => [n.id, n]));
  const be = new Map(before.edges.map((e) => [edgeKey(e), e]));
  const ae = new Map(after.edges.map((e) => [edgeKey(e), e]));
  return {
    addedNodes: after.nodes.filter((n) => !b.has(n.id)),
    removedNodes: before.nodes.filter((n) => !a.has(n.id)),
    changedNodes: after.nodes.flatMap((n) => {
      const old = b.get(n.id);
      return old !== void 0 && (old.kind !== n.kind || old.label !== n.label || old.basis !== n.basis || old.group !== n.group) ? [{ before: old, after: n }] : [];
    }),
    addedEdges: after.edges.filter((e) => !be.has(edgeKey(e))),
    removedEdges: before.edges.filter((e) => !ae.has(edgeKey(e)))
  };
}
function mergeForDelta(before, after) {
  const diff = diffGraphs(before, after);
  const classes = /* @__PURE__ */ new Map();
  for (const n of diff.addedNodes) classes.set(n.id, "added");
  for (const n of diff.removedNodes) classes.set(n.id, "removed");
  for (const c of diff.changedNodes) classes.set(c.after.id, "changed");
  const nodes = [...after.nodes, ...diff.removedNodes];
  const edges = [
    ...after.edges,
    ...diff.removedEdges.map((e) => ({ ...e, label: `${e.label} (removed)` }))
  ];
  return {
    graph: { ...after, title: `${after.title} (change)`, nodes, edges },
    classes
  };
}
function applyChange(graph, change) {
  const removed = new Set(change.removeNodes ?? []);
  const nodes = [
    ...graph.nodes.filter((n) => !removed.has(n.id)),
    ...(change.addNodes ?? []).filter((n) => !graph.nodes.some((x) => x.id === n.id))
  ];
  const dropEdge = (e) => removed.has(e.from) || removed.has(e.to) || (change.removeEdges ?? []).some(
    (r) => r.from === e.from && r.to === e.to && (r.label === void 0 || r.label === e.label)
  );
  const edges = [
    ...graph.edges.filter((e) => !dropEdge(e)),
    ...(change.addEdges ?? []).filter((e) => !graph.edges.some((x) => edgeKey(x) === edgeKey(e)))
  ];
  return { ...graph, nodes, edges };
}

// ../../../packages/architecture-graph/src/mermaid.ts
var text = (value, max = 60) => (
  // Quotes, brackets, angle brackets, and line breaks would end the label or inject markup.
  Array.from(value, (ch) => /["\n\r<>[\]{}|`]/.test(ch) ? " " : ch).join("").replace(/\s+/g, " ").trim().slice(0, max)
);
function hash(value) {
  let h = 2166136261;
  for (const ch of value) h = Math.imul(h ^ (ch.codePointAt(0) ?? 0), 16777619) >>> 0;
  return h.toString(36);
}
function trimUnderscores(value) {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}
function mermaidIds(ids) {
  const out = /* @__PURE__ */ new Map();
  const used = /* @__PURE__ */ new Set();
  for (const id of [...ids].sort()) {
    const slug = trimUnderscores(id.replace(/[^A-Za-z0-9]+/g, "_")).slice(0, 40) || "n";
    let candidate = `n_${slug}`;
    if (used.has(candidate)) candidate = `${candidate}_${hash(id)}`;
    used.add(candidate);
    out.set(id, candidate);
  }
  return out;
}
var NODE_STYLE = {
  intended: "stroke-dasharray: 5 3",
  declared: "",
  deployed: "stroke-width:2px",
  observed: "stroke-width:3px",
  inferred: "stroke-dasharray: 2 2"
};
function toMermaid(graph, options = {}) {
  const ids = mermaidIds(graph.nodes.map((n) => n.id));
  const lines = [`flowchart ${options.direction ?? "LR"}`];
  const nodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const draw = (indent, node) => {
    lines.push(`${indent}${ids.get(node.id)}["${text(node.kind)}: ${text(node.label)}"]`);
  };
  const grouped = options.groups !== false;
  const groups = [
    ...new Set(nodes.flatMap((n) => n.group === void 0 ? [] : [n.group]))
  ].sort();
  if (grouped)
    for (const group of groups) {
      lines.push(`  subgraph g_${hash(group)}["${text(group)}"]`);
      for (const node of nodes) if (node.group === group) draw("    ", node);
      lines.push("  end");
    }
  for (const node of nodes) if (!grouped || node.group === void 0) draw("  ", node);
  const edges = [...graph.edges].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.label.localeCompare(b.label)
  );
  for (const edge of edges) {
    const from = ids.get(edge.from);
    const to = ids.get(edge.to);
    if (from === void 0 || to === void 0) continue;
    const label = text(edge.label);
    const tag = edge.basis === "declared" || edge.basis === "deployed" ? "" : ` (${edge.basis})`;
    const caption = `${label}${tag}`.trim();
    const arrow = edge.basis === "inferred" || edge.basis === "intended" ? "-.->" : edge.basis === "observed" ? "==>" : "-->";
    lines.push(
      caption === "" ? `  ${from} ${arrow} ${to}` : `  ${from} ${arrow}|"${caption}"| ${to}`
    );
  }
  for (const node of nodes) {
    const style = NODE_STYLE[node.basis];
    if (style !== "") lines.push(`  style ${ids.get(node.id)} ${style}`);
  }
  if (options.classes !== void 0) {
    lines.push(
      "  classDef added fill:#d4f5d4,stroke:#2a7a2a",
      "  classDef removed fill:#f9d6d6,stroke:#a02020",
      "  classDef changed fill:#fdf0c4,stroke:#9a7b00"
    );
    for (const node of nodes) {
      const cls = options.classes.get(node.id);
      if (cls !== void 0) lines.push(`  class ${ids.get(node.id)} ${cls}`);
    }
  }
  return lines.join("\n");
}
var LEGEND = "Solid arrow: declared in code or listed in the account. Dotted: intended by a design, or inferred from permissions or configuration (it can happen; not shown to happen). Thick: observed in telemetry.";

// ../../../packages/architecture-graph/src/model.ts
var BASES = ["intended", "declared", "deployed", "observed", "inferred"];
var emptyGraph = (title) => ({
  schemaVersion: "1",
  title,
  nodes: [],
  edges: [],
  notes: []
});
var MAX_NODES = 500;
var MAX_EDGES = 2e3;

// ../../../packages/template-analysis/src/data/replacement.json
var replacement_default = {
  note: "createOnly lists properties the CloudFormation resource provider schema marks createOnlyProperties: changing one replaces the resource. Conditional or nested cases are not captured.",
  retrieved: "2026-10-31",
  source: "https://schema.cloudformation.us-east-1.amazonaws.com/CloudformationSchema.zip",
  supplement: {
    note: "Properties whose change CloudFormation documents as constrained in prose rather than as a replacement rule. The analyzer reports possible replacement or a failed update, never a certain replacement; a change set confirms.",
    source: "https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb-table.html",
    types: {
      "AWS::DynamoDB::Table": [
        "KeySchema",
        "AttributeDefinitions",
        "LocalSecondaryIndexes",
        "GlobalSecondaryIndexes"
      ]
    }
  },
  types: {
    "AWS::ApiGateway::Account": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::ApiKey": {
      createOnly: ["GenerateDistinctId", "Name", "Value"],
      primaryIdentifier: ["APIKeyId"]
    },
    "AWS::ApiGateway::Authorizer": {
      createOnly: ["RestApiId"],
      primaryIdentifier: ["RestApiId", "AuthorizerId"]
    },
    "AWS::ApiGateway::BasePathMapping": {
      createOnly: ["BasePath", "DomainName"],
      primaryIdentifier: ["DomainName", "BasePath"]
    },
    "AWS::ApiGateway::BasePathMappingV2": {
      createOnly: ["BasePath", "DomainNameArn"],
      primaryIdentifier: ["BasePathMappingArn"]
    },
    "AWS::ApiGateway::ClientCertificate": {
      createOnly: [],
      primaryIdentifier: ["ClientCertificateId"]
    },
    "AWS::ApiGateway::Deployment": {
      createOnly: ["DeploymentCanarySettings", "RestApiId"],
      primaryIdentifier: ["DeploymentId", "RestApiId"]
    },
    "AWS::ApiGateway::DocumentationPart": {
      createOnly: ["Location", "RestApiId"],
      primaryIdentifier: ["DocumentationPartId", "RestApiId"]
    },
    "AWS::ApiGateway::DocumentationVersion": {
      createOnly: ["DocumentationVersion", "RestApiId"],
      primaryIdentifier: ["DocumentationVersion", "RestApiId"]
    },
    "AWS::ApiGateway::DomainName": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::ApiGateway::DomainNameAccessAssociation": {
      createOnly: [
        "AccessAssociationSource",
        "AccessAssociationSourceType",
        "DomainNameArn",
        "Tags"
      ],
      primaryIdentifier: ["DomainNameAccessAssociationArn"]
    },
    "AWS::ApiGateway::DomainNameV2": {
      createOnly: ["DomainName", "EndpointConfiguration", "SecurityPolicy"],
      primaryIdentifier: ["DomainNameArn"]
    },
    "AWS::ApiGateway::GatewayResponse": {
      createOnly: ["ResponseType", "RestApiId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::Method": {
      createOnly: ["HttpMethod", "ResourceId", "RestApiId"],
      primaryIdentifier: ["RestApiId", "ResourceId", "HttpMethod"]
    },
    "AWS::ApiGateway::Model": {
      createOnly: ["ContentType", "Name", "RestApiId"],
      primaryIdentifier: ["RestApiId", "Name"]
    },
    "AWS::ApiGateway::RequestValidator": {
      createOnly: ["Name", "RestApiId"],
      primaryIdentifier: ["RestApiId", "RequestValidatorId"]
    },
    "AWS::ApiGateway::Resource": {
      createOnly: ["ParentId", "PathPart", "RestApiId"],
      primaryIdentifier: ["RestApiId", "ResourceId"]
    },
    "AWS::ApiGateway::RestApi": {
      createOnly: [],
      primaryIdentifier: ["RestApiId"]
    },
    "AWS::ApiGateway::Stage": {
      createOnly: ["RestApiId", "StageName"],
      primaryIdentifier: ["RestApiId", "StageName"]
    },
    "AWS::ApiGateway::UsagePlan": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::UsagePlanKey": {
      createOnly: ["KeyId", "KeyType", "UsagePlanId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::ApiGateway::VpcLink": {
      createOnly: ["TargetArns"],
      primaryIdentifier: ["VpcLinkId"]
    },
    "AWS::ApiGatewayV2::Api": {
      createOnly: ["ProtocolType"],
      primaryIdentifier: ["ApiId"]
    },
    "AWS::ApiGatewayV2::ApiGatewayManagedOverrides": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId"]
    },
    "AWS::ApiGatewayV2::ApiMapping": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["ApiMappingId", "DomainName"]
    },
    "AWS::ApiGatewayV2::Authorizer": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["AuthorizerId", "ApiId"]
    },
    "AWS::ApiGatewayV2::Deployment": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "DeploymentId"]
    },
    "AWS::ApiGatewayV2::DomainName": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::ApiGatewayV2::Integration": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "IntegrationId"]
    },
    "AWS::ApiGatewayV2::IntegrationResponse": {
      createOnly: ["ApiId", "IntegrationId"],
      primaryIdentifier: ["ApiId", "IntegrationId", "IntegrationResponseId"]
    },
    "AWS::ApiGatewayV2::Model": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "ModelId"]
    },
    "AWS::ApiGatewayV2::PortalProduct": {
      createOnly: [],
      primaryIdentifier: ["PortalProductArn"]
    },
    "AWS::ApiGatewayV2::Route": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "RouteId"]
    },
    "AWS::ApiGatewayV2::RouteResponse": {
      createOnly: ["ApiId", "RouteId"],
      primaryIdentifier: ["ApiId", "RouteId", "RouteResponseId"]
    },
    "AWS::ApiGatewayV2::RoutingRule": {
      createOnly: ["DomainNameArn"],
      primaryIdentifier: ["RoutingRuleArn"]
    },
    "AWS::ApiGatewayV2::Stage": {
      createOnly: ["ApiId", "StageName"],
      primaryIdentifier: ["ApiId", "StageName"]
    },
    "AWS::ApiGatewayV2::VpcLink": {
      createOnly: ["SecurityGroupIds", "SubnetIds"],
      primaryIdentifier: ["VpcLinkId"]
    },
    "AWS::AppSync::Api": {
      createOnly: [],
      primaryIdentifier: ["ApiArn"]
    },
    "AWS::AppSync::ApiCache": {
      createOnly: ["ApiId", "AtRestEncryptionEnabled", "TransitEncryptionEnabled"],
      primaryIdentifier: ["Id"]
    },
    "AWS::AppSync::ApiKey": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["ApiId", "ApiKeyId"]
    },
    "AWS::AppSync::ChannelNamespace": {
      createOnly: ["ApiId", "Name"],
      primaryIdentifier: ["ChannelNamespaceArn"]
    },
    "AWS::AppSync::DataSource": {
      createOnly: ["ApiId", "Name"],
      primaryIdentifier: ["DataSourceArn"]
    },
    "AWS::AppSync::DomainName": {
      createOnly: ["CertificateArn", "DomainName"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::AppSync::DomainNameApiAssociation": {
      createOnly: ["DomainName"],
      primaryIdentifier: ["ApiAssociationIdentifier"]
    },
    "AWS::AppSync::FunctionConfiguration": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::AppSync::GraphQLApi": {
      createOnly: [],
      primaryIdentifier: ["Arn"]
    },
    "AWS::AppSync::GraphQLSchema": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::AppSync::Resolver": {
      createOnly: ["ApiId", "FieldName", "TypeName"],
      primaryIdentifier: ["ResolverArn"]
    },
    "AWS::AppSync::SourceApiAssociation": {
      createOnly: ["MergedApiIdentifier", "SourceApiIdentifier"],
      primaryIdentifier: ["AssociationArn"]
    },
    "AWS::AppSync::Type": {
      createOnly: ["ApiId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Athena::CapacityReservation": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Athena::DataCatalog": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Athena::NamedQuery": {
      createOnly: ["Database", "Description", "Name", "QueryString", "WorkGroup"],
      primaryIdentifier: ["NamedQueryId"]
    },
    "AWS::Athena::PreparedStatement": {
      createOnly: ["StatementName", "WorkGroup"],
      primaryIdentifier: ["StatementName", "WorkGroup"]
    },
    "AWS::Athena::WorkGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Backup::BackupAccessPoint": {
      createOnly: ["AccessPointInTime", "AccessPointPolicy", "Name", "RecoveryPointArn"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Backup::BackupPlan": {
      createOnly: [],
      primaryIdentifier: ["BackupPlanId"]
    },
    "AWS::Backup::BackupSelection": {
      createOnly: ["BackupPlanId", "BackupSelection"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Backup::BackupVault": {
      createOnly: ["BackupVaultName", "EncryptionKeyArn"],
      primaryIdentifier: ["BackupVaultName"]
    },
    "AWS::Backup::Framework": {
      createOnly: ["FrameworkName"],
      primaryIdentifier: ["FrameworkArn"]
    },
    "AWS::Backup::LegalHold": {
      createOnly: ["Description", "RecoveryPointSelection", "Title"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Backup::LogicallyAirGappedBackupVault": {
      createOnly: ["BackupVaultName", "EncryptionKeyArn", "MaxRetentionDays", "MinRetentionDays"],
      primaryIdentifier: ["BackupVaultName"]
    },
    "AWS::Backup::ReportPlan": {
      createOnly: ["ReportPlanName"],
      primaryIdentifier: ["ReportPlanArn"]
    },
    "AWS::Backup::RestoreTestingPlan": {
      createOnly: ["RestoreTestingPlanName"],
      primaryIdentifier: ["RestoreTestingPlanName"]
    },
    "AWS::Backup::RestoreTestingSelection": {
      createOnly: [
        "ProtectedResourceType",
        "RestoreTestingPlanName",
        "RestoreTestingSelectionName"
      ],
      primaryIdentifier: ["RestoreTestingPlanName", "RestoreTestingSelectionName"]
    },
    "AWS::Backup::TieringConfiguration": {
      createOnly: ["TieringConfigurationName"],
      primaryIdentifier: ["TieringConfigurationName"]
    },
    "AWS::CertificateManager::Account": {
      createOnly: [],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::CertificateManager::AcmeDomainValidation": {
      createOnly: [
        "AcmeEndpointArn",
        "DomainName",
        "PrevalidationOptions/DnsPrevalidation/HostedZoneId"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CertificateManager::AcmeEndpoint": {
      createOnly: ["AuthorizationBehavior", "CertificateTags"],
      primaryIdentifier: ["AcmeEndpointArn"]
    },
    "AWS::CertificateManager::AcmeExternalAccountBinding": {
      createOnly: ["AcmeEndpointArn", "Expiration", "RoleArn"],
      primaryIdentifier: ["AcmeExternalAccountBindingArn"]
    },
    "AWS::CertificateManager::Certificate": {
      createOnly: [
        "CertificateAuthorityArn",
        "CertificateExport",
        "DomainName",
        "DomainValidationOptions",
        "KeyAlgorithm",
        "SubjectAlternativeNames"
      ],
      primaryIdentifier: ["CertificateArn"]
    },
    "AWS::CloudFront::AnycastIpList": {
      createOnly: ["IpCount", "Name", "Tags"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::CachePolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::CloudFrontOriginAccessIdentity": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::ConnectionFunction": {
      createOnly: ["ConnectionFunctionConfig/Runtime", "Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::ConnectionGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::ContinuousDeploymentPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::Distribution": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::DistributionTenant": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::FieldLevelEncryptionConfig": {
      createOnly: ["CallerReference"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudFront::FieldLevelEncryptionProfile": {
      createOnly: ["FieldLevelEncryptionProfileConfig/CallerReference"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudFront::Function": {
      createOnly: ["Name"],
      primaryIdentifier: ["FunctionARN"]
    },
    "AWS::CloudFront::KeyGroup": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::KeyValueStore": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::CloudFront::MonitoringSubscription": {
      createOnly: ["DistributionId"],
      primaryIdentifier: ["DistributionId"]
    },
    "AWS::CloudFront::OriginAccessControl": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::OriginRequestPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::PublicKey": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::RealtimeLogConfig": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudFront::ResponseHeadersPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::StreamingDistribution": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::TrustStore": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudFront::VpcOrigin": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudWatch::AccessGrant": {
      createOnly: [
        "DomainId",
        "Name",
        "Permission",
        "Principal",
        "ScopedActions",
        "SpaceId",
        "Tags"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::AccessProfile": {
      createOnly: ["SpaceId"],
      primaryIdentifier: ["SpaceId", "ProfileId"]
    },
    "AWS::CloudWatch::Alarm": {
      createOnly: ["AlarmName"],
      primaryIdentifier: ["AlarmName"]
    },
    "AWS::CloudWatch::AlarmMuteRule": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::AnomalyDetector": {
      createOnly: [
        "Dimensions",
        "MetricCharacteristics",
        "MetricMathAnomalyDetector",
        "MetricName",
        "Namespace",
        "SingleMetricAnomalyDetector",
        "Stat"
      ],
      primaryIdentifier: ["Id"]
    },
    "AWS::CloudWatch::CompositeAlarm": {
      createOnly: ["AlarmName"],
      primaryIdentifier: ["AlarmName"]
    },
    "AWS::CloudWatch::Dashboard": {
      createOnly: ["DashboardName"],
      primaryIdentifier: ["DashboardName"]
    },
    "AWS::CloudWatch::Domain": {
      createOnly: [],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::DomainAccessGrantForOrganization": {
      createOnly: ["DomainId", "Name", "Permission", "Principal", "Tags"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::DomainForOrganization": {
      createOnly: ["DomainAccessRoleArn"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::InsightRule": {
      createOnly: ["RuleName"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::Integration": {
      createOnly: ["IntegrationType", "Name"],
      primaryIdentifier: ["IntegrationArn"]
    },
    "AWS::CloudWatch::LogAlarm": {
      createOnly: ["AlarmName"],
      primaryIdentifier: ["AlarmName"]
    },
    "AWS::CloudWatch::MetricStream": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::CloudWatch::OTelEnrichment": {
      createOnly: [],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::CloudWatch::OmniDashboard": {
      createOnly: ["SpaceId"],
      primaryIdentifier: ["SpaceId", "DashboardId"]
    },
    "AWS::CloudWatch::ResourceMetricsConfiguration": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::CloudWatch::Space": {
      createOnly: ["AgentCoreEvaluationRoleArn", "DataAccessRoleArn", "DomainId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::CloudWatch::View": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::CodeDeploy::Application": {
      createOnly: ["ApplicationName", "ComputePlatform"],
      primaryIdentifier: ["ApplicationName"]
    },
    "AWS::CodeDeploy::DeploymentConfig": {
      createOnly: [
        "ComputePlatform",
        "DeploymentConfigName",
        "MinimumHealthyHosts",
        "TrafficRoutingConfig",
        "ZonalConfig"
      ],
      primaryIdentifier: ["DeploymentConfigName"]
    },
    "AWS::CodeDeploy::DeploymentGroup": {
      createOnly: ["ApplicationName", "DeploymentGroupName"],
      primaryIdentifier: ["ApplicationName", "DeploymentGroupName"]
    },
    "AWS::Cognito::IdentityPool": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::Cognito::IdentityPoolPrincipalTag": {
      createOnly: ["IdentityPoolId", "IdentityProviderName"],
      primaryIdentifier: ["IdentityPoolId", "IdentityProviderName"]
    },
    "AWS::Cognito::IdentityPoolRoleAttachment": {
      createOnly: ["IdentityPoolId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Cognito::LogDeliveryConfiguration": {
      createOnly: ["UserPoolId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Cognito::ManagedLoginBranding": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ManagedLoginBrandingId"]
    },
    "AWS::Cognito::Terms": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "TermsId"]
    },
    "AWS::Cognito::UserPool": {
      createOnly: [],
      primaryIdentifier: ["UserPoolId"]
    },
    "AWS::Cognito::UserPoolClient": {
      createOnly: ["GenerateSecret", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ClientId"]
    },
    "AWS::Cognito::UserPoolDomain": {
      createOnly: ["Domain", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "Domain"]
    },
    "AWS::Cognito::UserPoolGroup": {
      createOnly: ["GroupName", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "GroupName"]
    },
    "AWS::Cognito::UserPoolIdentityProvider": {
      createOnly: ["ProviderName", "ProviderType", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ProviderName"]
    },
    "AWS::Cognito::UserPoolRegionalConfigurationAttachment": {
      createOnly: ["UserPoolId"],
      primaryIdentifier: ["UserPoolId"]
    },
    "AWS::Cognito::UserPoolReplica": {
      createOnly: ["RegionName", "UserPoolId", "UserPoolTagsAtCreate"],
      primaryIdentifier: ["UserPoolId", "RegionName"]
    },
    "AWS::Cognito::UserPoolResourceServer": {
      createOnly: ["Identifier", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "Identifier"]
    },
    "AWS::Cognito::UserPoolRiskConfigurationAttachment": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ClientId"]
    },
    "AWS::Cognito::UserPoolUICustomizationAttachment": {
      createOnly: ["ClientId", "UserPoolId"],
      primaryIdentifier: ["UserPoolId", "ClientId"]
    },
    "AWS::Cognito::UserPoolUser": {
      createOnly: [
        "ClientMetadata",
        "DesiredDeliveryMediums",
        "ForceAliasCreation",
        "MessageAction",
        "UserAttributes",
        "UserPoolId",
        "Username",
        "ValidationData"
      ],
      primaryIdentifier: ["UserPoolId", "Username"]
    },
    "AWS::Cognito::UserPoolUserToGroupAttachment": {
      createOnly: ["GroupName", "UserPoolId", "Username"],
      primaryIdentifier: ["UserPoolId", "GroupName", "Username"]
    },
    "AWS::DynamoDB::GlobalTable": {
      createOnly: ["TableName"],
      primaryIdentifier: ["TableName"]
    },
    "AWS::DynamoDB::Table": {
      createOnly: ["ImportSourceSpecification", "TableName"],
      primaryIdentifier: ["TableName"]
    },
    "AWS::ECR::PublicRepository": {
      createOnly: ["RepositoryName"],
      primaryIdentifier: ["RepositoryName"]
    },
    "AWS::ECR::PullThroughCacheRule": {
      createOnly: [
        "CredentialArn",
        "CustomRoleArn",
        "EcrRepositoryPrefix",
        "UpstreamRegistry",
        "UpstreamRegistryUrl",
        "UpstreamRepositoryPrefix"
      ],
      primaryIdentifier: ["EcrRepositoryPrefix"]
    },
    "AWS::ECR::PullTimeUpdateExclusion": {
      createOnly: ["PrincipalArn"],
      primaryIdentifier: ["PrincipalArn"]
    },
    "AWS::ECR::RegistryPolicy": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::ECR::RegistryScanningConfiguration": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::ECR::ReplicationConfiguration": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::ECR::Repository": {
      createOnly: [
        "EncryptionConfiguration",
        "EncryptionConfiguration/EncryptionType",
        "EncryptionConfiguration/KmsKey",
        "RepositoryName"
      ],
      primaryIdentifier: ["RepositoryName"]
    },
    "AWS::ECR::RepositoryCreationTemplate": {
      createOnly: ["Prefix"],
      primaryIdentifier: ["Prefix"]
    },
    "AWS::ECR::SigningConfiguration": {
      createOnly: [],
      primaryIdentifier: ["RegistryId"]
    },
    "AWS::EFS::AccessPoint": {
      createOnly: [
        "ClientToken",
        "CreationInfo",
        "CreationInfo/OwnerGid",
        "CreationInfo/OwnerUid",
        "CreationInfo/Permissions",
        "FileSystemId",
        "PosixUser",
        "PosixUser/Gid",
        "PosixUser/SecondaryGids",
        "PosixUser/Uid",
        "RootDirectory",
        "RootDirectory/CreationInfo",
        "RootDirectory/Path"
      ],
      primaryIdentifier: ["AccessPointId"]
    },
    "AWS::EFS::FileSystem": {
      createOnly: ["AvailabilityZoneName", "Encrypted", "KmsKeyId", "PerformanceMode"],
      primaryIdentifier: ["FileSystemId"]
    },
    "AWS::EFS::MountTarget": {
      createOnly: ["FileSystemId", "IpAddress", "IpAddressType", "Ipv6Address", "SubnetId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Events::ApiDestination": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::Archive": {
      createOnly: ["ArchiveName", "SourceArn"],
      primaryIdentifier: ["ArchiveName"]
    },
    "AWS::Events::Connection": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::Endpoint": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::EventBus": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Events::EventBusPolicy": {
      createOnly: ["EventBusName", "StatementId"],
      primaryIdentifier: ["EventBusName", "StatementId"]
    },
    "AWS::Events::Rule": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Blueprint": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Catalog": {
      createOnly: ["Name"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::Glue::Classifier": {
      createOnly: [
        "CsvClassifier/Name",
        "GrokClassifier/Name",
        "JsonClassifier/Name",
        "XMLClassifier/Name"
      ],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::Connection": {
      createOnly: ["CatalogId", "ConnectionInput/Name"],
      primaryIdentifier: ["CatalogId", "Name"]
    },
    "AWS::Glue::ConnectionType": {
      createOnly: [
        "ConnectionProperties",
        "ConnectionType",
        "ConnectorAuthenticationConfiguration",
        "Description",
        "IntegrationType",
        "RestConfiguration"
      ],
      primaryIdentifier: ["ConnectionTypeArn"]
    },
    "AWS::Glue::Crawler": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::CustomEntityType": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::DataCatalogEncryptionSettings": {
      createOnly: ["CatalogId"],
      primaryIdentifier: ["CatalogId"]
    },
    "AWS::Glue::DataQualityRuleset": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::Database": {
      createOnly: ["DatabaseName"],
      primaryIdentifier: ["DatabaseName"]
    },
    "AWS::Glue::DevEndpoint": {
      createOnly: ["EndpointName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Glue::IdentityCenterConfiguration": {
      createOnly: ["InstanceArn"],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::Glue::Integration": {
      createOnly: [
        "AdditionalEncryptionContext",
        "IntegrationConfig",
        "IntegrationConfig/RefreshInterval",
        "IntegrationName",
        "KmsKeyId",
        "SourceArn",
        "TargetArn"
      ],
      primaryIdentifier: ["IntegrationArn", "IntegrationName"]
    },
    "AWS::Glue::IntegrationResourceProperty": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn", "ResourcePropertyArn"]
    },
    "AWS::Glue::Job": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::MLTransform": {
      createOnly: [
        "InputRecordTables",
        "TransformEncryption",
        "TransformParameters/FindMatchesParameters/PrimaryKeyColumnName"
      ],
      primaryIdentifier: ["TransformId"]
    },
    "AWS::Glue::Partition": {
      createOnly: ["CatalogId", "DatabaseName", "PartitionInput/Values", "TableName"],
      primaryIdentifier: [
        "CatalogId",
        "DatabaseName",
        "TableName",
        "IdentifierPartitionInputValues"
      ]
    },
    "AWS::Glue::Registry": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Schema": {
      createOnly: ["DataFormat", "Name", "Registry", "SchemaDefinition"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::SchemaVersion": {
      createOnly: ["Schema", "SchemaDefinition"],
      primaryIdentifier: ["VersionId"]
    },
    "AWS::Glue::SchemaVersionMetadata": {
      createOnly: ["Key", "SchemaVersionId", "Value"],
      primaryIdentifier: ["SchemaVersionId", "Key", "Value"]
    },
    "AWS::Glue::SecurityConfiguration": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::Session": {
      createOnly: [
        "Command",
        "Connections",
        "DefaultArguments",
        "Description",
        "GlueVersion",
        "Id",
        "IdleTimeout",
        "MaxCapacity",
        "NumberOfWorkers",
        "RequestOrigin",
        "Role",
        "SecurityConfiguration",
        "Timeout",
        "WorkerType"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Table": {
      createOnly: ["CatalogId", "DatabaseName", "Name", "TableInput/Name"],
      primaryIdentifier: ["CatalogId", "DatabaseName", "Name"]
    },
    "AWS::Glue::TableOptimizer": {
      createOnly: ["CatalogId", "DatabaseName", "TableName", "Type"],
      primaryIdentifier: ["TableName", "DatabaseName", "Type", "CatalogId"]
    },
    "AWS::Glue::Trigger": {
      createOnly: ["Name", "Type", "WorkflowName"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::UsageProfile": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Glue::UserDefinedFunction": {
      createOnly: ["DatabaseName", "FunctionName", "FunctionType"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Glue::Workflow": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::IAM::AccessKey": {
      createOnly: ["Serial", "UserName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::IAM::Group": {
      createOnly: ["GroupName"],
      primaryIdentifier: ["GroupName"]
    },
    "AWS::IAM::GroupPolicy": {
      createOnly: ["GroupName", "PolicyName"],
      primaryIdentifier: ["PolicyName", "GroupName"]
    },
    "AWS::IAM::InstanceProfile": {
      createOnly: ["InstanceProfileName", "Path"],
      primaryIdentifier: ["InstanceProfileName"]
    },
    "AWS::IAM::ManagedPolicy": {
      createOnly: ["Description", "ManagedPolicyName", "Path"],
      primaryIdentifier: ["PolicyArn"]
    },
    "AWS::IAM::OIDCProvider": {
      createOnly: ["Url"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::IAM::Policy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::IAM::Role": {
      createOnly: ["Path", "RoleName"],
      primaryIdentifier: ["RoleName"]
    },
    "AWS::IAM::RolePolicy": {
      createOnly: ["PolicyName", "RoleName"],
      primaryIdentifier: ["PolicyName", "RoleName"]
    },
    "AWS::IAM::SAMLProvider": {
      createOnly: ["AddPrivateKey", "Name", "RemovePrivateKey"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::IAM::ServerCertificate": {
      createOnly: ["CertificateBody", "CertificateChain", "PrivateKey", "ServerCertificateName"],
      primaryIdentifier: ["ServerCertificateName"]
    },
    "AWS::IAM::ServiceLinkedRole": {
      createOnly: ["AWSServiceName", "CustomSuffix"],
      primaryIdentifier: ["RoleName"]
    },
    "AWS::IAM::User": {
      createOnly: ["UserName"],
      primaryIdentifier: ["UserName"]
    },
    "AWS::IAM::UserPolicy": {
      createOnly: ["PolicyName", "UserName"],
      primaryIdentifier: ["PolicyName", "UserName"]
    },
    "AWS::IAM::UserToGroupAddition": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::IAM::VirtualMFADevice": {
      createOnly: ["Base32StringSeed", "Path", "VirtualMfaDeviceName"],
      primaryIdentifier: ["SerialNumber"]
    },
    "AWS::KMS::Alias": {
      createOnly: ["AliasName"],
      primaryIdentifier: ["AliasName"]
    },
    "AWS::KMS::Key": {
      createOnly: [],
      primaryIdentifier: ["KeyId"]
    },
    "AWS::KMS::ReplicaKey": {
      createOnly: ["PrimaryKeyArn"],
      primaryIdentifier: ["KeyId"]
    },
    "AWS::Kinesis::Channel": {
      createOnly: [
        "ChannelName",
        "EncryptionConfiguration",
        "S3DestinationConfiguration/DeadLetterQueueS3Configuration",
        "S3DestinationConfiguration/StorageConfiguration",
        "S3TablesDestinationConfiguration/DeadLetterQueueS3Configuration",
        "S3TablesDestinationConfiguration/S3TablesConfigurationList",
        "ServiceExecutionRoleARN",
        "StreamConfigurationList"
      ],
      primaryIdentifier: ["ChannelARN"]
    },
    "AWS::Kinesis::ResourcePolicy": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::Kinesis::Stream": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Kinesis::StreamConsumer": {
      createOnly: ["ConsumerName", "StreamARN", "Tags"],
      primaryIdentifier: ["ConsumerARN"]
    },
    "AWS::KinesisFirehose::DeliveryStream": {
      createOnly: [
        "AmazonOpenSearchServerlessDestinationConfiguration/VpcConfiguration",
        "AmazonopensearchserviceDestinationConfiguration/VpcConfiguration",
        "DatabaseSourceConfiguration",
        "DeliveryStreamName",
        "DeliveryStreamType",
        "DirectPutSourceConfiguration",
        "ElasticsearchDestinationConfiguration/VpcConfiguration",
        "IcebergDestinationConfiguration/CatalogConfiguration",
        "KinesisStreamSourceConfiguration",
        "MSKSourceConfiguration",
        "SnowflakeDestinationConfiguration/SnowflakeVpcConfiguration"
      ],
      primaryIdentifier: ["DeliveryStreamName"]
    },
    "AWS::Lambda::Alias": {
      createOnly: ["FunctionName", "Name"],
      primaryIdentifier: ["AliasArn"]
    },
    "AWS::Lambda::CapacityProvider": {
      createOnly: [
        "CapacityProviderName",
        "InstanceRequirements",
        "KmsKeyArn",
        "PermissionsConfig",
        "VpcConfig"
      ],
      primaryIdentifier: ["CapacityProviderName"]
    },
    "AWS::Lambda::CodeSigningConfig": {
      createOnly: [],
      primaryIdentifier: ["CodeSigningConfigArn"]
    },
    "AWS::Lambda::EventInvokeConfig": {
      createOnly: ["FunctionName", "Qualifier"],
      primaryIdentifier: ["FunctionName", "Qualifier"]
    },
    "AWS::Lambda::EventSourceMapping": {
      createOnly: [
        "EventSourceArn",
        "SelfManagedEventSource",
        "StartingPosition",
        "StartingPositionTimestamp"
      ],
      primaryIdentifier: ["Id"]
    },
    "AWS::Lambda::Function": {
      createOnly: ["FunctionName", "PackageType", "TenancyConfig"],
      primaryIdentifier: ["FunctionName"]
    },
    "AWS::Lambda::LayerVersion": {
      createOnly: [
        "CompatibleArchitectures",
        "CompatibleRuntimes",
        "Content",
        "Description",
        "LayerName",
        "LicenseInfo"
      ],
      primaryIdentifier: ["LayerVersionArn"]
    },
    "AWS::Lambda::LayerVersionPermission": {
      createOnly: ["Action", "LayerVersionArn", "OrganizationId", "Principal"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Lambda::MicrovmImage": {
      createOnly: ["Name"],
      primaryIdentifier: ["ImageArn"]
    },
    "AWS::Lambda::NetworkConnector": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Lambda::Permission": {
      createOnly: [
        "Action",
        "EventSourceToken",
        "FunctionName",
        "FunctionUrlAuthType",
        "InvokedViaFunctionUrl",
        "Principal",
        "PrincipalOrgID",
        "SourceAccount",
        "SourceArn"
      ],
      primaryIdentifier: ["FunctionName", "Id"]
    },
    "AWS::Lambda::ResourcePolicy": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::Lambda::Url": {
      createOnly: ["Qualifier", "TargetFunctionArn"],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::Lambda::Version": {
      createOnly: [
        "CodeSha256",
        "Description",
        "FunctionName",
        "ProvisionedConcurrencyConfig",
        "RuntimePolicy"
      ],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::Lambda::WebFunction": {
      createOnly: ["FunctionName"],
      primaryIdentifier: ["FunctionArn"]
    },
    "AWS::Lambda::WebFunctionEndpoint": {
      createOnly: ["EndpointName", "EndpointType", "FunctionName", "Regions"],
      primaryIdentifier: ["EndpointArn"]
    },
    "AWS::Lambda::WebFunctionRevision": {
      createOnly: ["BuildConfig", "Description", "FunctionName", "KmsKeyArn", "ServiceConfig"],
      primaryIdentifier: ["RevisionArn"]
    },
    "AWS::Logs::AccountPolicy": {
      createOnly: ["PolicyName", "PolicyType"],
      primaryIdentifier: ["AccountId", "PolicyType", "PolicyName"]
    },
    "AWS::Logs::Delivery": {
      createOnly: ["DeliveryDestinationArn", "DeliverySourceName"],
      primaryIdentifier: ["DeliveryId"]
    },
    "AWS::Logs::DeliveryDestination": {
      createOnly: ["DeliveryDestinationType", "DestinationResourceArn", "Name", "OutputFormat"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Logs::DeliverySource": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Logs::Destination": {
      createOnly: ["DestinationName"],
      primaryIdentifier: ["DestinationName"]
    },
    "AWS::Logs::Integration": {
      createOnly: ["IntegrationName", "IntegrationType", "ResourceConfig"],
      primaryIdentifier: ["IntegrationName"]
    },
    "AWS::Logs::LogAnomalyDetector": {
      createOnly: [],
      primaryIdentifier: ["AnomalyDetectorArn"]
    },
    "AWS::Logs::LogGroup": {
      createOnly: ["LogGroupName"],
      primaryIdentifier: ["LogGroupName"]
    },
    "AWS::Logs::LogStream": {
      createOnly: ["LogGroupName", "LogStreamName"],
      primaryIdentifier: ["LogGroupName", "LogStreamName"]
    },
    "AWS::Logs::MetricFilter": {
      createOnly: ["FilterName", "LogGroupName"],
      primaryIdentifier: ["LogGroupName", "FilterName"]
    },
    "AWS::Logs::QueryDefinition": {
      createOnly: [],
      primaryIdentifier: ["QueryDefinitionId"]
    },
    "AWS::Logs::ResourcePolicy": {
      createOnly: ["PolicyName"],
      primaryIdentifier: ["PolicyName"]
    },
    "AWS::Logs::ScheduledQuery": {
      createOnly: ["Name"],
      primaryIdentifier: ["ScheduledQueryArn"]
    },
    "AWS::Logs::StorageTierPolicy": {
      createOnly: [],
      primaryIdentifier: ["AccountId"]
    },
    "AWS::Logs::SubscriptionFilter": {
      createOnly: ["FilterName", "LogGroupName"],
      primaryIdentifier: ["FilterName", "LogGroupName"]
    },
    "AWS::Logs::Transformer": {
      createOnly: ["LogGroupIdentifier"],
      primaryIdentifier: ["LogGroupIdentifier"]
    },
    "AWS::OpenSearchService::Application": {
      createOnly: ["KmsKeyArn", "Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::OpenSearchService::Domain": {
      createOnly: ["DomainName", "EngineMode"],
      primaryIdentifier: ["DomainName"]
    },
    "AWS::Pipes::Pipe": {
      createOnly: [
        "Name",
        "Source",
        "SourceParameters/ActiveMQBrokerParameters/QueueName",
        "SourceParameters/DynamoDBStreamParameters/StartingPosition",
        "SourceParameters/KinesisStreamParameters/StartingPosition",
        "SourceParameters/KinesisStreamParameters/StartingPositionTimestamp",
        "SourceParameters/ManagedStreamingKafkaParameters/ConsumerGroupID",
        "SourceParameters/ManagedStreamingKafkaParameters/StartingPosition",
        "SourceParameters/ManagedStreamingKafkaParameters/TopicName",
        "SourceParameters/RabbitMQBrokerParameters/QueueName",
        "SourceParameters/RabbitMQBrokerParameters/VirtualHost",
        "SourceParameters/SelfManagedKafkaParameters/AdditionalBootstrapServers",
        "SourceParameters/SelfManagedKafkaParameters/ConsumerGroupID",
        "SourceParameters/SelfManagedKafkaParameters/StartingPosition",
        "SourceParameters/SelfManagedKafkaParameters/TopicName"
      ],
      primaryIdentifier: ["Name"]
    },
    "AWS::RDS::ClusterSnapshot": {
      createOnly: ["DBClusterIdentifier", "DBClusterSnapshotIdentifier"],
      primaryIdentifier: ["DBClusterSnapshotArn"]
    },
    "AWS::RDS::CustomDBEngineVersion": {
      createOnly: [
        "DatabaseInstallationFiles",
        "DatabaseInstallationFilesS3BucketName",
        "DatabaseInstallationFilesS3Prefix",
        "Engine",
        "EngineVersion",
        "ImageId",
        "KMSKeyId",
        "Manifest",
        "SourceCustomDbEngineVersionIdentifier",
        "UseAwsProvidedLatestImage"
      ],
      primaryIdentifier: ["Engine", "EngineVersion"]
    },
    "AWS::RDS::DBCluster": {
      createOnly: [
        "ClusterScalabilityType",
        "DBClusterIdentifier",
        "DBSubnetGroupName",
        "DBSystemId",
        "DatabaseName",
        "EngineMode",
        "KmsKeyId",
        "PubliclyAccessible",
        "RestoreToTime",
        "RestoreType",
        "SnapshotIdentifier",
        "SourceDBClusterIdentifier",
        "SourceDbClusterResourceId",
        "SourceRegion",
        "StorageEncrypted",
        "UseLatestRestorableTime",
        "WithExpressConfiguration"
      ],
      primaryIdentifier: ["DBClusterIdentifier"]
    },
    "AWS::RDS::DBClusterEndpoint": {
      createOnly: ["DBClusterEndpointIdentifier", "DBClusterIdentifier"],
      primaryIdentifier: ["DBClusterEndpointArn"]
    },
    "AWS::RDS::DBClusterParameterGroup": {
      createOnly: ["DBClusterParameterGroupName", "Description", "Family"],
      primaryIdentifier: ["DBClusterParameterGroupName"]
    },
    "AWS::RDS::DBInstance": {
      createOnly: [
        "BackupTarget",
        "CharacterSetName",
        "CustomIAMInstanceProfile",
        "DBClusterIdentifier",
        "DBInstanceIdentifier",
        "DBName",
        "DBSubnetGroupName",
        "DBSystemId",
        "KmsKeyId",
        "MasterUsername",
        "NcharCharacterSetName",
        "SourceRegion",
        "StorageEncrypted",
        "Timezone"
      ],
      primaryIdentifier: ["DBInstanceIdentifier"]
    },
    "AWS::RDS::DBParameterGroup": {
      createOnly: ["DBParameterGroupName", "Description", "Family"],
      primaryIdentifier: ["DBParameterGroupName"]
    },
    "AWS::RDS::DBProxy": {
      createOnly: [
        "DBProxyName",
        "EndpointNetworkType",
        "EngineFamily",
        "TargetConnectionNetworkType",
        "VpcSubnetIds"
      ],
      primaryIdentifier: ["DBProxyName"]
    },
    "AWS::RDS::DBProxyEndpoint": {
      createOnly: ["DBProxyEndpointName", "DBProxyName", "EndpointNetworkType", "VpcSubnetIds"],
      primaryIdentifier: ["DBProxyEndpointName"]
    },
    "AWS::RDS::DBProxyTargetGroup": {
      createOnly: ["DBProxyName", "TargetGroupName"],
      primaryIdentifier: ["TargetGroupArn"]
    },
    "AWS::RDS::DBSecurityGroup": {
      createOnly: ["EC2VpcId", "GroupDescription"],
      primaryIdentifier: ["Id"]
    },
    "AWS::RDS::DBSecurityGroupIngress": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::RDS::DBShardGroup": {
      createOnly: ["DBClusterIdentifier", "DBShardGroupIdentifier", "PubliclyAccessible"],
      primaryIdentifier: ["DBShardGroupIdentifier"]
    },
    "AWS::RDS::DBSnapshot": {
      createOnly: ["DBInstanceIdentifier", "DBSnapshotIdentifier"],
      primaryIdentifier: ["DBSnapshotArn"]
    },
    "AWS::RDS::DBSubnetGroup": {
      createOnly: ["DBSubnetGroupName"],
      primaryIdentifier: ["DBSubnetGroupName"]
    },
    "AWS::RDS::Deployment": {
      createOnly: [
        "BlueGreenDeploymentName",
        "Source",
        "TargetAllocatedStorage",
        "TargetDBClusterParameterGroupName",
        "TargetDBInstanceClass",
        "TargetDBParameterGroupName",
        "TargetEngineVersion",
        "TargetIops",
        "TargetStorageThroughput",
        "TargetStorageType",
        "UpgradeTargetStorageConfig"
      ],
      primaryIdentifier: ["Arn"]
    },
    "AWS::RDS::EventSubscription": {
      createOnly: ["SnsTopicArn", "SubscriptionName"],
      primaryIdentifier: ["SubscriptionName"]
    },
    "AWS::RDS::GlobalCluster": {
      createOnly: [
        "Engine",
        "GlobalClusterIdentifier",
        "SourceDBClusterIdentifier",
        "StorageEncrypted"
      ],
      primaryIdentifier: ["GlobalClusterIdentifier"]
    },
    "AWS::RDS::Integration": {
      createOnly: ["AdditionalEncryptionContext", "KMSKeyId", "SourceArn", "TargetArn"],
      primaryIdentifier: ["IntegrationArn"]
    },
    "AWS::RDS::OptionGroup": {
      createOnly: [
        "EngineName",
        "MajorEngineVersion",
        "OptionGroupDescription",
        "OptionGroupName"
      ],
      primaryIdentifier: ["OptionGroupName"]
    },
    "AWS::Route53::CidrCollection": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Route53::DNSSEC": {
      createOnly: ["HostedZoneId"],
      primaryIdentifier: ["HostedZoneId"]
    },
    "AWS::Route53::DelegationSet": {
      createOnly: [],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Route53::HealthCheck": {
      createOnly: [
        "HealthCheckConfig/MeasureLatency",
        "HealthCheckConfig/RequestInterval",
        "HealthCheckConfig/Type"
      ],
      primaryIdentifier: ["HealthCheckId"]
    },
    "AWS::Route53::HostedZone": {
      createOnly: ["DelegationSetId", "Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Route53::KeySigningKey": {
      createOnly: ["HostedZoneId", "KeyManagementServiceArn", "Name"],
      primaryIdentifier: ["HostedZoneId", "Name"]
    },
    "AWS::Route53::QueryLoggingConfig": {
      createOnly: ["CloudWatchLogsLogGroupArn", "HostedZoneId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Route53::RecordSet": {
      createOnly: ["HostedZoneId", "HostedZoneName"],
      primaryIdentifier: ["Name", "HostedZoneId", "Type", "SetIdentifier"]
    },
    "AWS::Route53::RecordSetGroup": {
      createOnly: ["HostedZoneId", "HostedZoneName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::Route53::TrafficPolicy": {
      createOnly: ["Document", "Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Route53::TrafficPolicyInstance": {
      createOnly: ["HostedZoneId", "Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::S3::AccessGrant": {
      createOnly: ["S3PrefixType", "Tags"],
      primaryIdentifier: ["AccessGrantId"]
    },
    "AWS::S3::AccessGrantsInstance": {
      createOnly: ["Tags"],
      primaryIdentifier: ["AccessGrantsInstanceArn"]
    },
    "AWS::S3::AccessGrantsLocation": {
      createOnly: ["Tags"],
      primaryIdentifier: ["AccessGrantsLocationId"]
    },
    "AWS::S3::AccessPoint": {
      createOnly: ["Bucket", "BucketAccountId", "Name", "VpcConfiguration"],
      primaryIdentifier: ["Name"]
    },
    "AWS::S3::Bucket": {
      createOnly: ["BucketName", "BucketNamePrefix", "BucketNamespace"],
      primaryIdentifier: ["BucketName"]
    },
    "AWS::S3::BucketPolicy": {
      createOnly: ["Bucket"],
      primaryIdentifier: ["Bucket"]
    },
    "AWS::S3::MultiRegionAccessPoint": {
      createOnly: ["Name", "PublicAccessBlockConfiguration", "Regions"],
      primaryIdentifier: ["Name"]
    },
    "AWS::S3::MultiRegionAccessPointPolicy": {
      createOnly: ["MrapName"],
      primaryIdentifier: ["MrapName"]
    },
    "AWS::S3::StorageLens": {
      createOnly: ["StorageLensConfiguration/Id"],
      primaryIdentifier: ["StorageLensConfiguration/Id"]
    },
    "AWS::S3::StorageLensGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SES::ConfigurationSet": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SES::ConfigurationSetEventDestination": {
      createOnly: ["ConfigurationSetName"],
      primaryIdentifier: ["Id", "ConfigurationSetName"]
    },
    "AWS::SES::ContactList": {
      createOnly: ["ContactListName"],
      primaryIdentifier: ["ContactListName"]
    },
    "AWS::SES::CustomVerificationEmailTemplate": {
      createOnly: ["TemplateName"],
      primaryIdentifier: ["TemplateName"]
    },
    "AWS::SES::DedicatedIpPool": {
      createOnly: ["PoolName"],
      primaryIdentifier: ["PoolName"]
    },
    "AWS::SES::EmailIdentity": {
      createOnly: ["EmailIdentity"],
      primaryIdentifier: ["EmailIdentity"]
    },
    "AWS::SES::EmailIdentityCertificate": {
      createOnly: ["CertificateArn", "EmailIdentity", "FromAddress"],
      primaryIdentifier: ["EmailIdentity", "FromAddress"]
    },
    "AWS::SES::MailManagerAddonInstance": {
      createOnly: ["AddonSubscriptionId"],
      primaryIdentifier: ["AddonInstanceId"]
    },
    "AWS::SES::MailManagerAddonSubscription": {
      createOnly: ["AddonName"],
      primaryIdentifier: ["AddonSubscriptionId"]
    },
    "AWS::SES::MailManagerAddressList": {
      createOnly: ["AddressListName"],
      primaryIdentifier: ["AddressListId"]
    },
    "AWS::SES::MailManagerArchive": {
      createOnly: ["KmsKeyArn"],
      primaryIdentifier: ["ArchiveId"]
    },
    "AWS::SES::MailManagerIngressPoint": {
      createOnly: ["NetworkConfiguration", "Type"],
      primaryIdentifier: ["IngressPointId"]
    },
    "AWS::SES::MailManagerRelay": {
      createOnly: [],
      primaryIdentifier: ["RelayId"]
    },
    "AWS::SES::MailManagerRuleSet": {
      createOnly: [],
      primaryIdentifier: ["RuleSetId"]
    },
    "AWS::SES::MailManagerTrafficPolicy": {
      createOnly: [],
      primaryIdentifier: ["TrafficPolicyId"]
    },
    "AWS::SES::MultiRegionEndpoint": {
      createOnly: ["Details", "EndpointName"],
      primaryIdentifier: ["EndpointName"]
    },
    "AWS::SES::ReceiptFilter": {
      createOnly: [
        "Filter",
        "Filter/IpFilter",
        "Filter/IpFilter/Cidr",
        "Filter/IpFilter/Policy",
        "Filter/Name"
      ],
      primaryIdentifier: ["Id"]
    },
    "AWS::SES::ReceiptRule": {
      createOnly: ["Rule/Name", "RuleSetName"],
      primaryIdentifier: ["RuleName", "RuleSetName"]
    },
    "AWS::SES::ReceiptRuleSet": {
      createOnly: ["RuleSetName"],
      primaryIdentifier: ["RuleSetName"]
    },
    "AWS::SES::Template": {
      createOnly: ["Template/TemplateName"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SES::Tenant": {
      createOnly: ["TenantName"],
      primaryIdentifier: ["TenantName"]
    },
    "AWS::SES::VdmAttributes": {
      createOnly: [],
      primaryIdentifier: ["VdmAttributesResourceId"]
    },
    "AWS::SNS::Subscription": {
      createOnly: ["Endpoint", "Protocol", "TopicArn"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::SNS::Topic": {
      createOnly: ["FifoTopic", "TopicName"],
      primaryIdentifier: ["TopicArn"]
    },
    "AWS::SNS::TopicInlinePolicy": {
      createOnly: ["TopicArn"],
      primaryIdentifier: ["TopicArn"]
    },
    "AWS::SNS::TopicPolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::SQS::Queue": {
      createOnly: ["FifoQueue", "QueueName"],
      primaryIdentifier: ["QueueUrl"]
    },
    "AWS::SQS::QueueInlinePolicy": {
      createOnly: ["Queue"],
      primaryIdentifier: ["Queue"]
    },
    "AWS::SQS::QueuePolicy": {
      createOnly: [],
      primaryIdentifier: ["Id"]
    },
    "AWS::SSM::Association": {
      createOnly: ["InstanceId"],
      primaryIdentifier: ["AssociationId"]
    },
    "AWS::SSM::CloudConnector": {
      createOnly: ["ConfigConnectorArn", "Configuration/AzureConfiguration/TenantId", "RoleArn"],
      primaryIdentifier: ["CloudConnectorArn"]
    },
    "AWS::SSM::Document": {
      createOnly: ["DocumentType", "Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SSM::MaintenanceWindow": {
      createOnly: [],
      primaryIdentifier: ["WindowId"]
    },
    "AWS::SSM::MaintenanceWindowTarget": {
      createOnly: ["WindowId"],
      primaryIdentifier: ["WindowId", "WindowTargetId"]
    },
    "AWS::SSM::MaintenanceWindowTask": {
      createOnly: ["TaskType", "WindowId"],
      primaryIdentifier: ["WindowId", "WindowTaskId"]
    },
    "AWS::SSM::OpsItem": {
      createOnly: ["Source"],
      primaryIdentifier: ["OpsItemArn"]
    },
    "AWS::SSM::Parameter": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SSM::PatchBaseline": {
      createOnly: ["OperatingSystem"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SSM::ResourceDataSync": {
      createOnly: [
        "BucketName",
        "BucketPrefix",
        "BucketRegion",
        "KMSKeyArn",
        "S3Destination",
        "SyncFormat",
        "SyncName",
        "SyncType"
      ],
      primaryIdentifier: ["SyncName"]
    },
    "AWS::SSM::ResourcePolicy": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["PolicyId", "ResourceArn"]
    },
    "AWS::SSM::ServiceSetting": {
      createOnly: ["SettingId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::Scheduler::Schedule": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::Scheduler::ScheduleGroup": {
      createOnly: ["Name"],
      primaryIdentifier: ["Name"]
    },
    "AWS::SecretsManager::ResourcePolicy": {
      createOnly: ["SecretId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SecretsManager::RotationSchedule": {
      createOnly: ["SecretId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SecretsManager::Secret": {
      createOnly: ["Name"],
      primaryIdentifier: ["Id"]
    },
    "AWS::SecretsManager::SecretTargetAttachment": {
      createOnly: ["SecretId"],
      primaryIdentifier: ["Id"]
    },
    "AWS::StepFunctions::Activity": {
      createOnly: ["EncryptionConfiguration", "Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::StepFunctions::StateMachine": {
      createOnly: ["StateMachineName", "StateMachineType"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::StepFunctions::StateMachineAlias": {
      createOnly: ["Name"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::StepFunctions::StateMachineVersion": {
      createOnly: ["Description", "StateMachineArn", "StateMachineRevisionId"],
      primaryIdentifier: ["Arn"]
    },
    "AWS::WAFv2::IPSet": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::LoggingConfiguration": {
      createOnly: ["ResourceArn"],
      primaryIdentifier: ["ResourceArn"]
    },
    "AWS::WAFv2::RegexPatternSet": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::RuleGroup": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::WebACL": {
      createOnly: ["Name", "Scope"],
      primaryIdentifier: ["Name", "Id", "Scope"]
    },
    "AWS::WAFv2::WebACLAssociation": {
      createOnly: ["ResourceArn", "WebACLArn"],
      primaryIdentifier: ["ResourceArn", "WebACLArn"]
    },
    "AWS::XRay::Group": {
      createOnly: [],
      primaryIdentifier: ["GroupARN"]
    },
    "AWS::XRay::ResourcePolicy": {
      createOnly: ["PolicyName"],
      primaryIdentifier: ["PolicyName"]
    },
    "AWS::XRay::SamplingRule": {
      createOnly: ["SamplingRule/Version"],
      primaryIdentifier: ["RuleARN"]
    },
    "AWS::XRay::TransactionSearchConfig": {
      createOnly: ["CloudWatchLogsConfiguration"],
      primaryIdentifier: ["AccountId"]
    }
  }
};

// ../../../packages/template-analysis/src/catalog.ts
var replacement = replacement_default;
var REPLACEMENT_DATA_SOURCE = replacement.source;
var REPLACEMENT_DATA_DATE = replacement.retrieved;
var SUPPLEMENT_NOTE = replacement.supplement.note;

// ../../../packages/context-contract/src/config.ts
var MAX_CONFIG_BYTES = 64 * 1024;

// ../../../packages/context-contract/src/schema.ts
var MAX_SNAPSHOT_BYTES = 16 * 1024;

// ../../../packages/report-contract/src/types.ts
var SCHEMA_VERSION = "1";

// ../../../packages/report-contract/src/validate.ts
var MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
var MAX_STRING = 2e4;
var MAX_ITEMS = 5e3;
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var str = (value, path) => typeof value === "string" && value.length <= MAX_STRING ? null : `${path} must be a string`;
var num = (value, path) => typeof value === "number" && Number.isFinite(value) ? null : `${path} must be a number`;
var bool = (value, path) => typeof value === "boolean" ? null : `${path} must be a boolean`;
var isoDate = (value, path) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? null : `${path} must be a date string`;
var nullable = (check) => (value, path) => value === null ? null : check(value, path);
var oneOf = (...allowed) => (value, path) => typeof value === "string" && allowed.includes(value) ? null : `${path} must be one of ${allowed.join(", ")}`;
var list = (item) => (value, path) => {
  if (!Array.isArray(value)) return `${path} must be a list`;
  if (value.length > MAX_ITEMS) return `${path} has too many items`;
  for (let i = 0; i < value.length; i += 1) {
    const problem = item(value[i], `${path}[${i}]`);
    if (problem !== null) return problem;
  }
  return null;
};
var strings = list(str);
var shape = (required, optional = {}) => (value, path) => {
  if (!isRecord(value)) return `${path} must be an object`;
  for (const [key, check] of Object.entries(required)) {
    const problem = check(value[key], `${path}.${key}`);
    if (problem !== null) return problem;
  }
  for (const [key, check] of Object.entries(optional)) {
    if (value[key] === void 0) continue;
    const problem = check(value[key], `${path}.${key}`);
    if (problem !== null) return problem;
  }
  return null;
};
var version = (value, path) => value === SCHEMA_VERSION ? null : `${path} must be "${SCHEMA_VERSION}" (unsupported schema version)`;
var context = shape({
  accountId: nullable(str),
  region: nullable(str),
  profile: nullable(str),
  identityVerified: bool,
  environment: oneOf("production", "non-production", "unknown")
});
var finding = shape(
  {
    id: str,
    ruleId: str,
    plugin: str,
    severity: oneOf("info", "low", "medium", "high", "critical"),
    status: oneOf("confirmed", "hypothesis", "informational"),
    source: oneOf("static", "account", "model"),
    title: str,
    explanation: str,
    evidence: list(shape({ type: str, reference: str }, { observedAt: str })),
    fingerprint: str
  },
  { affectedResources: strings, recommendation: str, confidence: oneOf("low", "medium", "high") }
);
var analysisReport = shape(
  {
    schemaVersion: version,
    plugin: str,
    generatedAt: isoDate,
    context,
    mode: oneOf("local", "read-only-cloud", "planned-change", "executed-change"),
    summary: str,
    findings: list(finding),
    limitations: strings
  },
  { suppressed: num }
);
var templateDiff = shape({
  schemaVersion: version,
  plugin: str,
  generatedAt: isoDate,
  context,
  method: oneOf("template", "change-set"),
  baseline: str,
  candidate: str,
  changes: list(
    shape(
      {
        logicalId: str,
        resourceType: str,
        action: oneOf("create", "update", "replace", "possible-replace", "delete", "unknown"),
        properties: strings,
        stateful: bool
      },
      { retained: bool, note: str }
    )
  ),
  summary: shape({
    create: num,
    update: num,
    replace: num,
    possibleReplace: num,
    delete: num,
    unknown: num
  }),
  limitations: strings
});
var testReport = shape(
  {
    schemaVersion: version,
    plugin: str,
    generatedAt: isoDate,
    framework: str,
    command: str,
    passed: num,
    failed: num,
    skipped: num,
    durationMs: num,
    failures: list(shape({ name: str, message: str }, { file: str })),
    truncated: bool,
    limitations: strings
  },
  { coverage: shape({}, { lines: num, branches: num, functions: num, statements: num }) }
);
var costEstimate = shape({
  schemaVersion: version,
  plugin: str,
  generatedAt: isoDate,
  kind: oneOf("estimated", "forecast", "actual"),
  currency: oneOf("USD"),
  region: str,
  rateDate: str,
  assumptions: strings,
  exclusions: strings,
  lines: list(
    shape({
      service: str,
      description: str,
      quantity: num,
      unit: str,
      unitPrice: num,
      monthly: num
    })
  ),
  totalMonthly: num,
  limitations: strings
});
var timeSeries = shape({
  schemaVersion: version,
  namespace: str,
  metric: str,
  statistic: str,
  unit: str,
  periodSeconds: num,
  start: isoDate,
  end: isoDate,
  dimensions: (value, path) => isRecord(value) && Object.values(value).every((entry) => typeof entry === "string") ? null : `${path} must map names to strings`,
  points: list(shape({ t: isoDate, v: nullable(num) }))
});
var architecturePlan = shape({
  schemaVersion: version,
  title: str,
  generatedAt: isoDate,
  requirements: (value, path) => isRecord(value) && Object.values(value).every((entry) => typeof entry === "string") ? null : `${path} must map names to strings`,
  components: list(shape({ id: str, kind: str, name: str, purpose: str })),
  integrations: list(
    shape({ from: str, to: str, style: oneOf("sync", "async", "event") }, { note: str })
  ),
  assumptions: strings,
  risks: strings,
  openQuestions: strings
});
function make(check) {
  const validate = (value) => {
    const problem = check(value, "$");
    return problem === null ? { ok: true, value } : { ok: false, error: problem };
  };
  const parse = (text2) => {
    if (text2.length > MAX_DOCUMENT_BYTES) return { ok: false, error: "document is too large" };
    let value;
    try {
      value = JSON.parse(text2);
    } catch {
      return { ok: false, error: "not valid JSON" };
    }
    return validate(value);
  };
  return { validate, parse };
}
var reportCodec = make(analysisReport);
var findingCodec = make(finding);
var diffCodec = make(templateDiff);
var testReportCodec = make(testReport);
var costCodec = make(costEstimate);
var timeSeriesCodec = make(timeSeries);
var planCodec = make(architecturePlan);

// ../../../packages/template-analysis/src/template.ts
var MAX_TEMPLATE_BYTES = 8 * 1024 * 1024;
var MAX_RESOURCES = 5e3;
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}
function names(value) {
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}
function parseTemplate(source) {
  let document = source;
  if (typeof source === "string") {
    if (source.length > MAX_TEMPLATE_BYTES) return { ok: false, error: "template is too large" };
    try {
      document = JSON.parse(source);
    } catch {
      return { ok: false, error: "template is not valid JSON (YAML templates are not supported)" };
    }
  }
  if (!isRecord2(document)) return { ok: false, error: "template must be a JSON object" };
  const resourcesValue = document["Resources"];
  if (!isRecord2(resourcesValue)) return { ok: false, error: "template has no Resources section" };
  const ids = Object.keys(resourcesValue);
  if (ids.length > MAX_RESOURCES) return { ok: false, error: "template has too many resources" };
  const resources = {};
  for (const logicalId of ids) {
    const entry = resourcesValue[logicalId];
    if (!isRecord2(entry) || typeof entry["Type"] !== "string") {
      return { ok: false, error: `resource ${logicalId} has no Type` };
    }
    resources[logicalId] = {
      logicalId,
      type: entry["Type"],
      properties: isRecord2(entry["Properties"]) ? entry["Properties"] : {},
      deletionPolicy: stringOrNull(entry["DeletionPolicy"]),
      updateReplacePolicy: stringOrNull(entry["UpdateReplacePolicy"]),
      dependsOn: names(entry["DependsOn"]),
      condition: stringOrNull(entry["Condition"]),
      metadata: isRecord2(entry["Metadata"]) ? entry["Metadata"] : {}
    };
  }
  return {
    ok: true,
    template: {
      resources,
      parameters: isRecord2(document["Parameters"]) ? document["Parameters"] : {},
      outputs: isRecord2(document["Outputs"]) ? document["Outputs"] : {},
      conditions: isRecord2(document["Conditions"]) ? document["Conditions"] : {},
      raw: document
    }
  };
}

// ../../../packages/template-analysis/src/graph.ts
var PSEUDO = /^AWS::/;
var SUB_VARIABLE = /\$\{([A-Za-z0-9:._-]+)\}/g;
function referencesIn(value, depth = 0, found = []) {
  if (depth > 40 || value === null || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) referencesIn(item, depth + 1, found);
    return found;
  }
  const record = value;
  for (const [key, inner] of Object.entries(record)) {
    if (key === "Ref" && typeof inner === "string" && !PSEUDO.test(inner)) {
      found.push([inner, "ref"]);
    } else if (key === "Fn::GetAtt") {
      const target = Array.isArray(inner) ? inner[0] : typeof inner === "string" ? inner.split(".")[0] : void 0;
      if (typeof target === "string") found.push([target, "getatt"]);
    } else if (key === "Fn::Sub") {
      const text2 = Array.isArray(inner) ? inner[0] : inner;
      const locals = Array.isArray(inner) && typeof inner[1] === "object" && inner[1] !== null ? new Set(Object.keys(inner[1])) : /* @__PURE__ */ new Set();
      if (typeof text2 === "string") {
        for (const match of text2.matchAll(SUB_VARIABLE)) {
          const name = (match[1] ?? "").split(".")[0] ?? "";
          if (name !== "" && !PSEUDO.test(name) && !locals.has(name)) found.push([name, "sub"]);
        }
      }
      if (Array.isArray(inner)) referencesIn(inner[1], depth + 1, found);
    } else {
      referencesIn(inner, depth + 1, found);
    }
  }
  return found;
}

// ../../../packages/architecture-graph/src/sources.ts
var SHOWN = {
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
  "AWS::SES::EmailIdentity": "email-identity"
};
var first = (value) => referencesIn(value)[0]?.[0] ?? null;
var allRefs = (value) => [...new Set(referencesIn(value).map(([id]) => id))];
var isRecord3 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var textOf = (value, fallback) => typeof value === "string" ? value : fallback;
function fromTemplate(template, group, prefix = "") {
  const resources = template.resources;
  const graph = emptyGraph("Architecture");
  const shown = (id) => id !== null && resources[id] !== void 0 && SHOWN[resources[id].type] !== void 0;
  const add = (from, to, label, basis) => {
    if (from === null || to === null || from === to || !shown(from) || !shown(to)) return;
    if (!graph.edges.some(
      (e) => e.from === prefix + from && e.to === prefix + to && e.label === label
    )) {
      const edge = { from: prefix + from, to: prefix + to, label, basis };
      graph.edges.push(edge);
    }
  };
  const ofType = (...types) => Object.values(resources).filter((r) => types.includes(r.type));
  for (const queue of ofType("AWS::SQS::Queue")) {
    const redrive = queue.properties["RedrivePolicy"];
    if (isRecord3(redrive))
      add(queue.logicalId, first(redrive["deadLetterTargetArn"]), "dead-letter", "declared");
  }
  for (const m of ofType("AWS::Lambda::EventSourceMapping"))
    add(
      first(m.properties["EventSourceArn"]),
      first(m.properties["FunctionName"]),
      "event source",
      "declared"
    );
  for (const custom of ofType("Custom::S3BucketNotifications")) {
    const bucket = first(custom.properties["BucketName"]);
    const config = custom.properties["NotificationConfiguration"];
    if (!isRecord3(config)) continue;
    for (const key of [
      "QueueConfigurations",
      "TopicConfigurations",
      "LambdaFunctionConfigurations"
    ]) {
      const list2 = config[key];
      if (Array.isArray(list2))
        for (const entry of list2)
          add(
            bucket,
            first(
              isRecord3(entry) ? entry["QueueArn"] ?? entry["TopicArn"] ?? entry["LambdaFunctionArn"] : null
            ),
            "object event",
            "declared"
          );
    }
  }
  for (const s of ofType("AWS::SNS::Subscription"))
    add(
      first(s.properties["TopicArn"]),
      first(s.properties["Endpoint"]),
      "subscription",
      "declared"
    );
  for (const rule of ofType("AWS::Events::Rule")) {
    const targets = rule.properties["Targets"];
    if (Array.isArray(targets))
      for (const t of targets)
        add(rule.logicalId, first(isRecord3(t) ? t["Arn"] : null), "rule target", "declared");
  }
  const integrationTarget = /* @__PURE__ */ new Map();
  for (const i of ofType("AWS::ApiGatewayV2::Integration"))
    integrationTarget.set(i.logicalId, first(i.properties["IntegrationUri"]));
  for (const route of ofType("AWS::ApiGatewayV2::Route")) {
    const integration = allRefs(route.properties["Target"]).find((id) => integrationTarget.has(id));
    if (integration !== void 0)
      add(
        first(route.properties["ApiId"]),
        integrationTarget.get(integration) ?? null,
        textOf(route.properties["RouteKey"], "route"),
        "declared"
      );
  }
  for (const method of ofType("AWS::ApiGateway::Method")) {
    const integration = method.properties["Integration"];
    add(
      first(method.properties["RestApiId"]),
      isRecord3(integration) ? first(integration["Uri"]) : null,
      textOf(method.properties["HttpMethod"], "method"),
      "declared"
    );
  }
  for (const dist of ofType("AWS::CloudFront::Distribution")) {
    const config = dist.properties["DistributionConfig"];
    const origins = isRecord3(config) ? config["Origins"] : null;
    if (Array.isArray(origins))
      for (const o of origins)
        add(dist.logicalId, first(isRecord3(o) ? o["DomainName"] : null), "origin", "declared");
  }
  const rolePolicies = /* @__PURE__ */ new Map();
  for (const policy of ofType("AWS::IAM::Policy", "AWS::IAM::ManagedPolicy")) {
    const targets = allRefs(policy.properties["PolicyDocument"]).filter(shown);
    for (const role of allRefs(policy.properties["Roles"]))
      rolePolicies.set(role, [...rolePolicies.get(role) ?? [], ...targets]);
  }
  for (const fn of ofType("AWS::Lambda::Function")) {
    for (const id of allRefs(fn.properties["Environment"]))
      add(fn.logicalId, id, "environment reference", "inferred");
    for (const role of allRefs(fn.properties["Role"]))
      for (const id of rolePolicies.get(role) ?? [])
        add(fn.logicalId, id, "permitted by IAM", "inferred");
  }
  const used = new Set(graph.edges.flatMap((e) => [e.from, e.to]));
  graph.nodes = Object.values(resources).filter(
    (r) => SHOWN[r.type] !== void 0 && (used.has(prefix + r.logicalId) || ["AWS::Lambda::Function", "AWS::DynamoDB::Table", "AWS::SQS::Queue"].includes(r.type))
  ).map((r) => ({
    id: prefix + r.logicalId,
    kind: SHOWN[r.type] ?? r.type,
    label: r.logicalId.replace(/[0-9A-F]{8}$/, ""),
    basis: "declared",
    ...group === void 0 ? {} : { group }
  }));
  return graph;
}
function fromStacks(stacks) {
  const graph = emptyGraph("Architecture");
  for (const stack of stacks) {
    const part = fromTemplate(stack.template, stack.name, `${stack.name}/`);
    graph.nodes.push(...part.nodes);
    graph.edges.push(...part.edges);
  }
  return graph;
}
function fromPlan(plan) {
  return {
    schemaVersion: "1",
    title: plan.title,
    nodes: plan.components.map((c) => ({
      id: c.id,
      kind: c.kind,
      label: c.name,
      basis: "intended"
    })),
    edges: plan.integrations.map((i) => ({
      from: i.from,
      to: i.to,
      label: i.note === void 0 ? i.style : `${i.style}: ${i.note}`,
      basis: "intended"
    })),
    notes: ["Intended design: nothing here is deployed or declared in code."]
  };
}
function fromInventory(inventory) {
  return {
    schemaVersion: "1",
    title: "Deployed inventory",
    nodes: inventory.resources.map((r) => ({
      id: r.id,
      kind: r.kind,
      label: r.name,
      basis: "deployed",
      ...r.account === void 0 && r.region === void 0 ? {} : { group: [r.account, r.region].filter((p) => p !== void 0).join(" / ") }
    })),
    edges: inventory.relations.map((r) => ({
      from: r.from,
      to: r.to,
      label: r.label,
      basis: r.observed === true ? "observed" : "inferred"
    })),
    notes: [
      "Resources come from the supplied inventory. A relation is observed only if the inventory says so; others are inferred and may not match real traffic."
    ]
  };
}
function fromStateMachine(definition, title = "State machine") {
  const graph = emptyGraph(title);
  let budget = 400;
  const walk = (def, prefix, group) => {
    if (!isRecord3(def) || !isRecord3(def["States"]) || budget <= 0) return null;
    const states = def["States"];
    for (const [name, raw] of Object.entries(states)) {
      if (budget-- <= 0) break;
      const state = isRecord3(raw) ? raw : {};
      graph.nodes.push({
        id: prefix + name,
        kind: textOf(state.Type, "State").toLowerCase(),
        label: name,
        basis: "declared",
        group
      });
      const edge = (to, label) => {
        if (typeof to === "string")
          graph.edges.push({ from: prefix + name, to: prefix + to, label, basis: "declared" });
      };
      edge(state.Next, "next");
      edge(state.Default, "default");
      if (Array.isArray(state.Choices))
        for (const c of state.Choices) edge(isRecord3(c) ? c["Next"] : null, "choice");
      if (Array.isArray(state.Catch))
        for (const c of state.Catch) edge(isRecord3(c) ? c["Next"] : null, "catch");
      const nested = Array.isArray(state.Branches) ? [...state.Branches] : [];
      const processor = state.ItemProcessor ?? state.Iterator;
      if (processor !== void 0) nested.push(processor);
      nested.forEach((sub, i) => {
        const start2 = walk(sub, `${prefix}${name}.${i}.`, `${group} > ${name}`);
        if (start2 !== null)
          graph.edges.push({
            from: prefix + name,
            to: start2,
            label: "contains",
            basis: "declared"
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

// ../../../packages/safe-output/src/redact.ts
var REDACTED = "[redacted]";
var ESC = 27;
var BEL = 7;
function isInvisible(code, keepLines) {
  if (keepLines && (code === 9 || code === 10 || code === 13)) return false;
  return code < 32 || code >= 127 && code <= 159 || code >= 8234 && code <= 8238 || code >= 8294 && code <= 8297;
}
function sanitizeText(value, keepLines = false) {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === ESC) {
      const kind = value.charAt(i + 1);
      if (kind === "[") {
        i += 2;
        while (i < value.length && !(value.charCodeAt(i) >= 64 && value.charCodeAt(i) <= 126))
          i += 1;
      } else if (kind === "]") {
        i += 2;
        while (i < value.length && value.charCodeAt(i) !== BEL && value.charCodeAt(i) !== ESC)
          i += 1;
        if (value.charCodeAt(i) === ESC) i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (!isInvisible(code, keepLines)) out += value.charAt(i);
  }
  return out;
}

// ../../../packages/safe-output/src/text.ts
var CREDENTIAL_VALUE = [
  /\b(AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g
];
var SECRET_PAIR = /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|authorization|credential|private[_-]?key|session[_-]?token)[A-Za-z0-9_.-]*)(["']?\s*[:=]\s*["']?)(?!\[redacted\])([^\s"',;}&]{3,})/gi;
var TOKEN_COUNT_NAME = /(?:max|min|input|output|total|prompt|completion|usage)[_-]?tokens$/i;
var BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
var EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
var CARD = /\b(?:\d[ -]?){13,19}\b/g;
function luhn(digits) {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}
function redactText(input, options = {}) {
  let redacted = 0;
  let text2 = sanitizeText(input, true);
  const replace = () => {
    redacted += 1;
    return REDACTED;
  };
  for (const pattern of CREDENTIAL_VALUE) text2 = text2.replace(pattern, replace);
  text2 = text2.replace(BEARER, (_match, scheme) => `${scheme} ${replace()}`);
  text2 = text2.replace(
    SECRET_PAIR,
    (match, name, separator, value) => (
      // A model's token budget (`maxTokens: 200`) is a count, not a credential.
      TOKEN_COUNT_NAME.test(name) && /^\d+$/.test(value) ? match : `${name}${separator}${replace()}`
    )
  );
  if (options.personalData !== false) {
    text2 = text2.replace(EMAIL, replace);
    text2 = text2.replace(CARD, (match) => {
      const digits = match.replace(/[^0-9]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? replace() : match;
    });
  }
  return { text: text2, redacted };
}

// ../../../packages/architecture-graph/src/validate.ts
var isRecord4 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isBasis = (value) => typeof value === "string" && BASES.includes(value);
function parseGraph(value) {
  if (!isRecord4(value) || value["schemaVersion"] !== "1")
    return { ok: false, error: 'not an architecture graph (schemaVersion must be "1")' };
  const nodes = value["nodes"];
  const edges = value["edges"];
  if (!Array.isArray(nodes) || !Array.isArray(edges))
    return { ok: false, error: "nodes and edges must be lists" };
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES)
    return { ok: false, error: "the graph is too large" };
  const text2 = (v) => typeof v === "string" && v.length > 0 && v.length < 300;
  const outNodes = [];
  for (const n of nodes) {
    if (!isRecord4(n) || !text2(n["id"]) || !text2(n["kind"]) || !text2(n["label"]) || !isBasis(n["basis"]))
      return { ok: false, error: "a node needs id, kind, label, and a valid basis" };
    const group = n["group"];
    if (group !== void 0 && !text2(group))
      return { ok: false, error: "a node group must be text" };
    outNodes.push({
      id: n["id"],
      kind: n["kind"],
      label: n["label"],
      basis: n["basis"],
      ...group === void 0 ? {} : { group }
    });
  }
  const outEdges = [];
  for (const e of edges) {
    if (!isRecord4(e) || !text2(e["from"]) || !text2(e["to"]) || !isBasis(e["basis"]) || typeof e["label"] !== "string")
      return { ok: false, error: "an edge needs from, to, label, and a valid basis" };
    const confidence = e["confidence"];
    if (confidence !== void 0 && confidence !== "high" && confidence !== "medium" && confidence !== "low")
      return { ok: false, error: "edge confidence must be high, medium, or low" };
    outEdges.push({
      from: e["from"],
      to: e["to"],
      label: e["label"].slice(0, 120),
      basis: e["basis"],
      ...confidence === void 0 ? {} : { confidence }
    });
  }
  const title = typeof value["title"] === "string" ? value["title"].slice(0, 120) : "Architecture";
  const notes = Array.isArray(value["notes"]) ? value["notes"].filter((n) => typeof n === "string").slice(0, 50) : [];
  return {
    ok: true,
    graph: { schemaVersion: "1", title, nodes: outNodes, edges: outEdges, notes }
  };
}
function validateGraph(graph, options = {}) {
  const problems = [];
  const ids = /* @__PURE__ */ new Set();
  for (const node of graph.nodes) {
    if (ids.has(node.id))
      problems.push({ severity: "error", message: `Node id "${node.id}" is used more than once.` });
    ids.add(node.id);
  }
  const seen = /* @__PURE__ */ new Set();
  const adjacency = /* @__PURE__ */ new Map();
  const touched = /* @__PURE__ */ new Set();
  for (const edge of graph.edges) {
    let ok = true;
    for (const end of [edge.from, edge.to])
      if (!ids.has(end)) {
        problems.push({
          severity: "error",
          message: `Edge ${edge.from} -> ${edge.to} refers to "${end}", which is not a node.`
        });
        ok = false;
      }
    if (!ok) continue;
    if (edge.from === edge.to)
      problems.push({ severity: "warning", message: `Edge on "${edge.from}" points to itself.` });
    const key = `${edge.from}\0${edge.to}\0${edge.label}\0${edge.basis}`;
    if (seen.has(key))
      problems.push({
        severity: "warning",
        message: `Edge ${edge.from} -> ${edge.to} ("${edge.label}") is listed twice.`
      });
    seen.add(key);
    touched.add(edge.from).add(edge.to);
    adjacency.set(edge.from, [...adjacency.get(edge.from) ?? [], edge.to]);
  }
  for (const node of graph.nodes)
    if (!touched.has(node.id) && graph.nodes.length > 1)
      problems.push({ severity: "warning", message: `Node "${node.id}" has no edges.` });
  const cycle = findCycle(graph, adjacency);
  if (cycle !== null)
    problems.push({
      severity: options.acyclic === true ? "error" : "warning",
      message: `Cycle: ${cycle.join(" -> ")}${options.acyclic === true ? "" : " (allowed, e.g. retries or feedback loops)"}.`
    });
  return problems;
}
function findCycle(graph, adjacency) {
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const result = { cycle: null };
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (result.cycle !== null) break;
      if (next === id) continue;
      if (state.get(next) === 1) result.cycle = [...stack.slice(stack.indexOf(next)), next];
      else if (state.get(next) === void 0) visit(next);
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const node of graph.nodes)
    if (state.get(node.id) === void 0 && result.cycle === null) visit(node.id);
  return result.cycle;
}
function redactGraph(graph) {
  let redacted = 0;
  const clean = (value) => {
    const result = redactText(value);
    redacted += result.redacted;
    return result.text;
  };
  return {
    graph: {
      ...graph,
      title: clean(graph.title),
      nodes: graph.nodes.map((n) => ({ ...n, label: clean(n.label) })),
      edges: graph.edges.map((e) => ({ ...e, label: clean(e.label) }))
    },
    redacted
  };
}

// ../../../packages/context-contract/src/node.ts
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
function readTextBounded(path, maxBytes) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (error) {
    return error.code === "ENOENT" ? { kind: "missing" } : { kind: "unreadable" };
  }
  try {
    if (!fstatSync(fd).isFile()) return { kind: "unreadable" };
    const buffer = Buffer.alloc(maxBytes + 1);
    let total = 0;
    while (total < buffer.length) {
      const read = readSync(fd, buffer, total, buffer.length - total, null);
      if (read === 0) break;
      total += read;
    }
    return total > maxBytes ? { kind: "too-large" } : { kind: "ok", text: buffer.toString("utf8", 0, total) };
  } catch {
    return { kind: "unreadable" };
  } finally {
    closeSync(fd);
  }
}

// ../../../packages/template-analysis/src/node.ts
import { readdirSync, statSync } from "node:fs";
import { basename as basename2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from "node:path";

// ../../../packages/tool-runner/src/index.ts
import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
var BASE_ENV_ALLOWLIST = [
  "PATH",
  "Path",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "SYSTEMROOT",
  "ComSpec",
  "LANG",
  "LC_ALL",
  "TERM",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR"
];
var AWS_ENV_ALLOWLIST = [
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_SDK_LOAD_CONFIG",
  "AWS_EC2_METADATA_DISABLED",
  "AWS_ENDPOINT_URL"
];
function scrubbedEnv(source, options = {}) {
  const allow = /* @__PURE__ */ new Set([
    ...BASE_ENV_ALLOWLIST,
    ...options.allowAws === true ? AWS_ENV_ALLOWLIST : [],
    ...options.extraAllow ?? []
  ]);
  const env = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== void 0 && allow.has(name)) env[name] = value;
  }
  return { ...env, ...options.extra };
}
function realLocation(path) {
  let current = resolve(path);
  const missing = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  return join(existsSync(current) ? realpathSync(current) : current, ...missing);
}
function isInside(root, path) {
  const rel = relative(realLocation(root), realLocation(path));
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}
function findPackageBin(root, packageName, binName) {
  let dir = resolve(root);
  for (let depth = 0; depth < 20; depth += 1) {
    const manifest = join(dir, "node_modules", packageName, "package.json");
    if (existsSync(manifest)) {
      try {
        const bin = JSON.parse(readFileSync(manifest, "utf8")).bin;
        const relativePath = typeof bin === "string" ? bin : bin?.[binName ?? packageName];
        if (relativePath === void 0) return null;
        const target = resolve(dir, "node_modules", packageName, relativePath);
        return existsSync(target) && isInside(join(dir, "node_modules", packageName), target) ? target : null;
      } catch {
        return null;
      }
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
function findOnPath(name, pathValue) {
  const suffixes = process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];
  for (const dir of (pathValue ?? "").split(delimiter)) {
    if (dir === "") continue;
    for (const suffix of suffixes) {
      const candidate = join(dir, `${name}${suffix}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}
var WINDOWS_SHIM = /\.(cmd|bat)$/i;
function runTool(options) {
  const started = Date.now();
  const cwd = options.cwd ?? options.root;
  const empty = (spawnError) => ({
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    durationMs: Date.now() - started,
    spawnError
  });
  if (!isInside(options.root, cwd))
    return Promise.resolve(empty("The working directory is outside the project."));
  if (process.platform === "win32" && WINDOWS_SHIM.test(options.command)) {
    return Promise.resolve(
      empty(
        "UNSUPPORTED_WINDOWS_SHIM: run the package's JavaScript entry with node instead (see findPackageBin)."
      )
    );
  }
  const prepared = { command: options.command, args: [...options.args] };
  return new Promise((resolvePromise) => {
    const posix = process.platform !== "win32";
    const child = spawn(prepared.command, prepared.args, {
      cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: posix
    });
    const chunks = { out: [], err: [] };
    const size = { out: 0, err: 0 };
    const truncated = { out: false, err: false };
    const keep = (kind) => (chunk) => {
      const room = options.maxOutputBytes - size[kind];
      if (room <= 0) {
        truncated[kind] = true;
        return;
      }
      const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
      if (chunk.length > room) truncated[kind] = true;
      chunks[kind].push(piece);
      size[kind] += piece.length;
    };
    child.stdout.on("data", keep("out"));
    child.stderr.on("data", keep("err"));
    let timedOut = false;
    const stop = () => {
      try {
        if (posix && child.pid !== void 0) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs);
    const finish = (exitCode, signal, spawnError) => {
      clearTimeout(timer);
      resolvePromise({
        exitCode,
        signal,
        stdout: Buffer.concat(chunks.out).toString("utf8"),
        stderr: Buffer.concat(chunks.err).toString("utf8"),
        stdoutTruncated: truncated.out,
        stderrTruncated: truncated.err,
        timedOut,
        durationMs: Date.now() - started,
        spawnError
      });
    };
    child.on("error", (error) => {
      finish(
        null,
        null,
        error.name === "Error" && "code" in error ? String(error.code) : error.name
      );
    });
    child.on("close", (code, signal) => {
      finish(code, signal, null);
    });
  });
}

// ../../../packages/template-analysis/src/node.ts
var MAX_STACKS = 100;
var TEMPLATE_SUFFIX = ".template.json";
function readTemplate(file, name, result) {
  const read = readTextBounded(file, MAX_TEMPLATE_BYTES);
  if (read.kind !== "ok") {
    result.problems.push(`${name}: the template file could not be read (${read.kind}).`);
    return;
  }
  const parsed = parseTemplate(read.text);
  if (!parsed.ok) {
    result.problems.push(`${name}: ${parsed.error}.`);
    return;
  }
  result.stacks.push({ name, file, template: parsed.template });
}
function manifestStacks(manifestText) {
  try {
    const manifest = JSON.parse(manifestText);
    const artifacts = manifest.artifacts;
    if (artifacts === void 0 || typeof artifacts !== "object") return [];
    return Object.entries(artifacts).filter(
      ([, artifact]) => artifact.type === "aws:cloudformation:stack" && typeof artifact.properties?.templateFile === "string"
    ).map(([name, artifact]) => ({
      name,
      templateFile: artifact.properties?.templateFile
    }));
  } catch {
    return [];
  }
}
function loadStacks(root, path) {
  const result = { stacks: [], problems: [] };
  const target = isAbsolute2(path) ? path : resolve2(root, path);
  if (!isInside(root, target)) {
    result.problems.push("The path is outside the project, so it was not read.");
    return result;
  }
  let info;
  try {
    info = statSync(target);
  } catch {
    result.problems.push(
      `${path} does not exist. Run \`synth\` first, or give the path of a cdk.out directory or a template.`
    );
    return result;
  }
  if (info.isFile()) {
    const name = basename2(target).replace(/(\.template)?\.json$/, "");
    readTemplate(target, name, result);
    return result;
  }
  const seen = /* @__PURE__ */ new Set();
  const manifest = readTextBounded(join2(target, "manifest.json"), 4 * 1024 * 1024);
  if (manifest.kind === "ok") {
    for (const { name, templateFile } of manifestStacks(manifest.text)) {
      if (templateFile !== basename2(templateFile)) {
        result.problems.push(
          `${name}: the manifest names a template outside the directory; skipped.`
        );
        continue;
      }
      seen.add(templateFile);
      if (result.stacks.length < MAX_STACKS) readTemplate(join2(target, templateFile), name, result);
    }
  }
  let files = [];
  try {
    files = readdirSync(target).filter((file) => file.endsWith(TEMPLATE_SUFFIX) && !seen.has(file)).sort();
  } catch {
  }
  for (const file of files) {
    if (result.stacks.length >= MAX_STACKS) {
      result.problems.push(`More than ${MAX_STACKS} templates; the rest were skipped.`);
      break;
    }
    readTemplate(join2(target, file), file.slice(0, -TEMPLATE_SUFFIX.length), result);
  }
  if (result.stacks.length === 0 && result.problems.length === 0) {
    result.problems.push(`No CloudFormation templates were found in ${path}.`);
  }
  return result;
}

// src/lib/artifact.ts
var DIAGRAM_TYPES = [
  "architecture",
  "dependency",
  "data-flow",
  "trust-boundaries",
  "event-flow",
  "state-graph",
  "deployment"
];
var EVENT_KINDS = /* @__PURE__ */ new Set([
  "queue",
  "topic",
  "rule",
  "bus",
  "stream",
  "delivery-stream",
  "function",
  "state-machine",
  "bucket"
]);
function selectFor(graph, type) {
  if (type === "event-flow") {
    const nodes = graph.nodes.filter((n) => EVENT_KINDS.has(n.kind));
    const ids = new Set(nodes.map((n) => n.id));
    return {
      ...graph,
      nodes,
      edges: graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && e.basis !== "inferred")
    };
  }
  if (type === "data-flow") {
    return {
      ...graph,
      edges: graph.edges.filter((e) => e.basis !== "inferred" || /IAM|environment/.test(e.label))
    };
  }
  return graph;
}
function buildArtifact(graph, type, now, provenance) {
  const shown = selectFor(graph, type);
  const direction = type === "dependency" || type === "deployment" ? "TB" : "LR";
  return {
    schemaVersion: "1",
    kind: "DiagramArtifact",
    diagramType: type,
    title: graph.title,
    generatedAt: now.toISOString(),
    mermaid: toMermaid(shown, { direction, groups: type !== "data-flow" }),
    legend: LEGEND,
    graph: shown,
    provenance
  };
}
function renderArtifact(a) {
  return [
    `${a.title} (${a.diagramType})`,
    "",
    "```mermaid",
    a.mermaid,
    "```",
    "",
    a.legend,
    ...a.provenance.map((p) => `Source: ${p}`),
    ...a.graph.notes.map((n) => `Note: ${n}`)
  ].join("\n");
}

// src/lib/files.ts
import { closeSync as closeSync2, mkdirSync, openSync as openSync2, writeSync } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute3, join as join3, resolve as resolve3 } from "node:path";
function writeNew(root, path, content) {
  const target = isAbsolute3(path) ? path : resolve3(root, path);
  if (!isInside(root, target))
    return { ok: false, error: "the output path is outside the project" };
  try {
    mkdirSync(dirname2(target), { recursive: true });
    if (!isInside(root, target))
      return { ok: false, error: "the output path is outside the project" };
    const fd = openSync2(target, "wx");
    try {
      writeSync(fd, typeof content === "string" ? Buffer.from(content, "utf8") : content);
    } finally {
      closeSync2(fd);
    }
    return { ok: true, file: target.slice(resolve3(root).length + 1).replaceAll("\\", "/") };
  } catch (error) {
    return error.code === "EEXIST" ? {
      ok: false,
      error: `${path} already exists; it was not overwritten. Choose another --out.`
    } : { ok: false, error: "the file could not be written" };
  }
}
var DEFAULT_DIR = join3("docs", "architecture", "diagrams");

// src/lib/render.ts
import { mkdtempSync, readFileSync as readFileSync2, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as join4 } from "node:path";
function rendererCommand(root, env) {
  const entry = findPackageBin(root, "@mermaid-js/mermaid-cli", "mmdc");
  if (entry !== null) return { command: process.execPath, prefix: [entry] };
  const onPath = findOnPath("mmdc", env["PATH"]);
  return onPath === null ? null : { command: onPath, prefix: [] };
}
async function renderImage(source, format, root, env, run = runTool) {
  const renderer = rendererCommand(root, env);
  if (renderer === null)
    return {
      ok: false,
      reason: "No Mermaid renderer found. Install @mermaid-js/mermaid-cli in the project (or put mmdc on PATH) for SVG/PNG; the Mermaid source was still written."
    };
  const dir = mkdtempSync(join4(tmpdir(), "aws-diagrams-"));
  try {
    const input = join4(dir, "in.mmd");
    const output = join4(dir, `out.${format}`);
    writeFileSync(input, source);
    const result = await run({
      command: renderer.command,
      args: [...renderer.prefix, "-i", input, "-o", output],
      root: dir,
      env: scrubbedEnv(env),
      timeoutMs: 6e4,
      maxOutputBytes: 2e4
    });
    if (result.spawnError !== null || result.exitCode !== 0)
      return { ok: false, reason: "The renderer failed; the Mermaid source was still written." };
    return { ok: true, data: readFileSync2(output) };
  } catch {
    return {
      ok: false,
      reason: "The renderer produced no output; the Mermaid source was still written."
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// src/lib/cli.ts
var USAGE = `Usage: aws-diagrams <command> [options]

  generate --from <file> [--type <t>]       From a graph, an architecture plan, or an inventory file (kind detected)
  from-cdk [path] [--stack name] [--type t] From cdk.out (default) or a template: declared links solid, inferred dotted
  from-asl <file>                           State graph of a Step Functions definition (JSON)
  update <graph> --change <file>            Apply added/removed nodes and edges; other ids and order are kept
  diff <before> <after>                     What changed between two graphs, as text and as a colored diagram
  validate <graph> [--acyclic]              Referential integrity, duplicates, isolated nodes, cycles
  export <graph> --out <name> [--format mmd|svg|png]   Write the source (always) and an image if a renderer exists

Types: ${DIAGRAM_TYPES.join(", ")}
Options: --json   --write (generate/from-cdk/from-asl: save under ${DEFAULT_DIR} as <name>.mmd and .json)   --name <name>

Reads files inside the project. Writes only new files and never overwrites one. No AWS calls.`;
var FLAGS = ["json", "write", "acyclic"];
var VALUED = ["from", "type", "stack", "change", "out", "format", "name"];
var usageError = (message) => ({
  exitCode: 2,
  stdout: `${message}

${USAGE}`
});
function readJson(root, path) {
  const target = isAbsolute4(path) ? path : resolve4(root, path);
  if (!isInside(root, target)) return { ok: false, error: `${path} is outside the project` };
  const read = readTextBounded(target, 4e6);
  if (read.kind !== "ok") return { ok: false, error: `${path} could not be read (${read.kind})` };
  try {
    return { ok: true, value: JSON.parse(read.text) };
  } catch {
    return { ok: false, error: `${path} is not valid JSON` };
  }
}
function graphFile(root, path) {
  const json = readJson(root, path);
  if (!json.ok) return json;
  const value = json.value?.graph ?? json.value;
  return parseGraph(value);
}
var isInventory = (v) => typeof v === "object" && v !== null && Array.isArray(v.resources) && Array.isArray(v.relations);
async function runCli(argv, deps) {
  const words = [];
  const options = /* @__PURE__ */ new Map();
  const flags = /* @__PURE__ */ new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (FLAGS.includes(name)) flags.add(name);
    else if (VALUED.includes(name)) {
      const value = argv[i + 1];
      if (value === void 0) return usageError(`--${name} needs a value`);
      options.set(name, value);
      i += 1;
    } else return usageError(`unknown option --${name}`);
  }
  const json = flags.has("json");
  const [command, a, b, extra] = words;
  if (extra !== void 0) return usageError("too many arguments");
  const now = deps.now ?? /* @__PURE__ */ new Date();
  const typeOption = options.get("type") ?? "architecture";
  if (!DIAGRAM_TYPES.includes(typeOption))
    return usageError(`unknown type ${typeOption}`);
  const type = typeOption;
  const print = (value, text2) => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text2
  });
  const finish = (graphIn, provenance, problems) => {
    const { graph, redacted } = redactGraph(graphIn);
    if (redacted > 0)
      problems.push(`${redacted} secret-like or personal value(s) in labels were redacted.`);
    const bad = validateGraph(graph).filter((p) => p.severity === "error");
    if (bad.length > 0)
      return {
        exitCode: 1,
        stdout: `The graph is not valid:
${bad.map((p) => `  - ${p.message}`).join("\n")}`
      };
    const artifact = buildArtifact(graph, type, now, provenance);
    let text2 = [renderArtifact(artifact), ...problems.map((p) => `Note: ${p}`)].join("\n");
    if (flags.has("write")) {
      const name = (options.get("name") ?? graph.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "diagram";
      const src = writeNew(deps.root, `${DEFAULT_DIR}/${name}.mmd`, `${artifact.mermaid}
`);
      const data = writeNew(
        deps.root,
        `${DEFAULT_DIR}/${name}.json`,
        `${JSON.stringify(artifact, null, 2)}
`
      );
      text2 += `
${[src, data].map((r) => r.ok ? `Created ${r.file}` : `Not written: ${r.error}`).join("\n")}`;
    }
    return print(artifact, text2);
  };
  if (command === "from-cdk") {
    const loaded = loadStacks(deps.root, a ?? "cdk.out");
    if (loaded.stacks.length === 0)
      return { exitCode: 1, stdout: loaded.problems.join("\n") || "No templates were found." };
    const wanted = options.get("stack");
    const stacks = wanted === void 0 ? loaded.stacks : loaded.stacks.filter((s) => s.name === wanted);
    if (stacks.length === 0) return usageError(`no stack named ${wanted ?? ""}`);
    const graph = fromStacks(stacks);
    graph.title = stacks.length === 1 ? stacks[0]?.name ?? "Architecture" : "Architecture";
    graph.notes.push("Shows what the templates define, not what is deployed in an account.");
    return finish(graph, ["synthesized templates (declared)"], loaded.problems);
  }
  if (command === "generate") {
    const from = options.get("from");
    if (from === void 0) return usageError("generate needs --from <file>");
    const file = readJson(deps.root, from);
    if (!file.ok) return { exitCode: 1, stdout: file.error };
    const value = file.value;
    const plan = planCodec.validate(value);
    if (plan.ok) return finish(fromPlan(plan.value), ["architecture plan (intended)"], []);
    if (isInventory(value))
      return finish(
        fromInventory(value),
        ["supplied inventory (deployed; relations inferred unless marked observed)"],
        []
      );
    const graph = parseGraph(value?.graph ?? value);
    if (graph.ok) return finish(graph.graph, ["supplied graph"], []);
    return {
      exitCode: 1,
      stdout: `${from} is not an architecture plan, an inventory, or a graph (${graph.error}).`
    };
  }
  if (command === "from-asl") {
    if (a === void 0) return usageError("from-asl needs a file");
    const file = readJson(deps.root, a);
    if (!file.ok) return { exitCode: 1, stdout: file.error };
    const graph = fromStateMachine(file.value, "State machine");
    if (graph.nodes.length === 0) return { exitCode: 1, stdout: `${a} has no States to draw.` };
    return finish(graph, ["state machine definition (declared)"], []);
  }
  if (command === "validate") {
    if (a === void 0) return usageError("validate needs a graph file");
    const g = graphFile(deps.root, a);
    if (!g.ok) return { exitCode: 1, stdout: g.error };
    const problems = validateGraph(g.graph, { acyclic: flags.has("acyclic") });
    const errors = problems.filter((p) => p.severity === "error").length;
    return {
      exitCode: errors > 0 ? 1 : 0,
      stdout: json ? JSON.stringify({ problems }, null, 2) : problems.length === 0 ? `Valid: ${g.graph.nodes.length} node(s), ${g.graph.edges.length} edge(s).` : problems.map((p) => `${p.severity}: ${p.message}`).join("\n")
    };
  }
  if (command === "update") {
    const changeFile = options.get("change");
    if (a === void 0 || changeFile === void 0)
      return usageError("update needs a graph and --change <file>");
    const g = graphFile(deps.root, a);
    if (!g.ok) return { exitCode: 1, stdout: g.error };
    const change = readJson(deps.root, changeFile);
    if (!change.ok) return { exitCode: 1, stdout: change.error };
    const updated = applyChange(g.graph, change.value);
    const reparsed = parseGraph(updated);
    if (!reparsed.ok)
      return { exitCode: 1, stdout: `The change gives an invalid graph: ${reparsed.error}` };
    const out = options.get("out");
    const diff = diffGraphs(g.graph, reparsed.graph);
    const summary = `+${diff.addedNodes.length}/-${diff.removedNodes.length} nodes, +${diff.addedEdges.length}/-${diff.removedEdges.length} edges`;
    if (out === void 0 || !flags.has("write"))
      return print(
        { graph: reparsed.graph, diff },
        `${summary}
${toMermaid(reparsed.graph)}
(Add --out <file> --write to save the updated graph as a new file.)`
      );
    const written = writeNew(deps.root, out, `${JSON.stringify(reparsed.graph, null, 2)}
`);
    return written.ok ? print({ written: written.file, diff }, `${summary}
Created ${written.file}`) : { exitCode: 1, stdout: written.error };
  }
  if (command === "diff") {
    if (a === void 0 || b === void 0) return usageError("diff needs two graph files");
    const before = graphFile(deps.root, a);
    const after = graphFile(deps.root, b);
    if (!before.ok) return { exitCode: 1, stdout: before.error };
    if (!after.ok) return { exitCode: 1, stdout: after.error };
    const diff = diffGraphs(before.graph, after.graph);
    const merged = mergeForDelta(before.graph, after.graph);
    const text2 = [
      `Nodes: +${diff.addedNodes.length} -${diff.removedNodes.length} ~${diff.changedNodes.length}; edges: +${diff.addedEdges.length} -${diff.removedEdges.length}`,
      ...diff.addedNodes.map((n) => `  + ${n.id} (${n.kind})`),
      ...diff.removedNodes.map((n) => `  - ${n.id} (${n.kind})`),
      ...diff.changedNodes.map((c) => `  ~ ${c.after.id}`),
      "",
      "```mermaid",
      toMermaid(merged.graph, { classes: merged.classes }),
      "```"
    ].join("\n");
    return print(diff, text2);
  }
  if (command === "export") {
    const out = options.get("out");
    if (a === void 0 || out === void 0)
      return usageError("export needs a graph and --out <name>");
    const g = graphFile(deps.root, a);
    if (!g.ok) return { exitCode: 1, stdout: g.error };
    const format = options.get("format") ?? "mmd";
    if (!["mmd", "svg", "png"].includes(format))
      return usageError("--format must be mmd, svg, or png");
    const base = out.replace(/\.(mmd|svg|png)$/, "");
    const source = toMermaid(redactGraph(g.graph).graph);
    const lines = [];
    const src = writeNew(deps.root, `${base}.mmd`, `${source}
`);
    lines.push(src.ok ? `Created ${src.file}` : `Not written: ${src.error}`);
    let exitCode = src.ok ? 0 : 1;
    if (format !== "mmd") {
      const image = await renderImage(
        source,
        format,
        deps.root,
        deps.env ?? process.env,
        deps.run
      );
      if (image.ok && image.data !== void 0) {
        const written = writeNew(deps.root, `${base}.${format}`, image.data);
        lines.push(written.ok ? `Created ${written.file}` : `Not written: ${written.error}`);
        if (!written.ok) exitCode = 1;
      } else lines.push(image.reason ?? "The image could not be produced.");
    }
    return { exitCode, stdout: lines.join("\n") };
  }
  return usageError(command === void 0 ? "a command is required" : `unknown command ${command}`);
}

// src/entries/cli.ts
try {
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const result = await runCli(process.argv.slice(2), { root, env: process.env });
  process.stdout.write(`${result.stdout}
`);
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(
    `aws-diagrams failed (${error instanceof Error ? error.name : "UnknownError"}).
`
  );
  process.exitCode = 1;
}
