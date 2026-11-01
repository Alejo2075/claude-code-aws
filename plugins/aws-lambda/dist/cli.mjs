import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// ../../../../packages/context-contract/src/node.ts
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

// ../../../../packages/context-contract/src/bar.ts
function maskAccount(accountId, ascii = false) {
  return `${accountId.slice(0, 4)}${ascii ? "..." : "\u2026"}${accountId.slice(-4)}`;
}

// ../../../../packages/context-contract/src/config.ts
var MAX_CONFIG_BYTES = 64 * 1024;

// ../../../../packages/context-contract/src/schema.ts
var MAX_SNAPSHOT_BYTES = 16 * 1024;

// ../../../../packages/report-contract/src/types.ts
var SCHEMA_VERSION = "1";

// ../../../../packages/report-contract/src/build.ts
var LOCAL_CONTEXT = {
  accountId: null,
  region: null,
  profile: null,
  identityVerified: false,
  environment: "unknown"
};
function fingerprint(...parts) {
  let hash = 0xcbf29ce484222325n;
  for (const char of parts.join("\0")) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
function makeFinding(input) {
  const { subject, evidence, ...rest } = input;
  const print = fingerprint(input.plugin, input.ruleId, subject);
  const status = input.source === "model" && input.status === "confirmed" && (evidence ?? []).length === 0 ? "hypothesis" : input.status;
  return {
    ...rest,
    status,
    evidence: evidence ?? [],
    id: `${input.ruleId}:${print.slice(0, 8)}`,
    fingerprint: print
  };
}
var ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
function sortFindings(findings) {
  return [...findings].sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity] || a.ruleId.localeCompare(b.ruleId) || a.id.localeCompare(b.id)
  );
}
function buildReport(input) {
  return {
    schemaVersion: SCHEMA_VERSION,
    plugin: input.plugin,
    generatedAt: (input.now ?? /* @__PURE__ */ new Date()).toISOString(),
    context: input.context,
    mode: input.mode,
    summary: input.summary,
    findings: sortFindings(input.findings),
    limitations: input.limitations,
    ...input.suppressed === void 0 || input.suppressed === 0 ? {} : { suppressed: input.suppressed }
  };
}
function describeContext(context2) {
  if (context2.accountId === null) return "no AWS account involved";
  const parts = [
    `account ${maskAccount(context2.accountId)}`,
    context2.region ?? "region unknown",
    context2.environment === "unknown" ? "environment not classified" : context2.environment
  ];
  return `${parts.join(" \xB7 ")} \xB7 ${context2.identityVerified ? "identity verified" : "identity NOT verified (last known)"}`;
}

// ../../../../packages/report-contract/src/render.ts
var LABEL = {
  critical: "CRITICAL",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
  info: "INFO"
};
function renderFinding(finding2) {
  const lines = [
    `[${LABEL[finding2.severity]}] [${finding2.status}] ${finding2.title} (${finding2.ruleId})`,
    `  ${finding2.explanation}`
  ];
  if (finding2.affectedResources !== void 0 && finding2.affectedResources.length > 0) {
    lines.push(`  Affected: ${finding2.affectedResources.join(", ")}`);
  }
  for (const evidence of finding2.evidence) {
    lines.push(
      `  Evidence: ${evidence.type} ${evidence.reference}${evidence.observedAt === void 0 ? "" : ` (${evidence.observedAt})`}`
    );
  }
  if (finding2.recommendation !== void 0) lines.push(`  Fix: ${finding2.recommendation}`);
  return lines;
}
function renderReport(report, options = {}) {
  const lines = [
    `${report.plugin} \xB7 ${report.generatedAt}`,
    `Context: ${describeContext(report.context)}`,
    ""
  ];
  lines.push(report.summary);
  const shown = report.findings.slice(0, options.maxFindings ?? report.findings.length);
  if (shown.length > 0) {
    lines.push("", `Findings (${report.findings.length}):`);
    for (const finding2 of shown) lines.push(...renderFinding(finding2), "");
    if (shown.length < report.findings.length) {
      lines.push(`... ${report.findings.length - shown.length} more; use --json for all.`, "");
    }
  } else {
    lines.push("", "No findings.");
  }
  if (report.suppressed !== void 0) {
    lines.push(`${report.suppressed} finding(s) hidden by exclusions in your configuration.`);
  }
  if (report.limitations.length > 0) {
    lines.push("Limitations:", ...report.limitations.map((limitation) => `  - ${limitation}`));
  }
  return lines.join("\n");
}

// ../../../../packages/report-contract/src/validate.ts
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
  const parse2 = (text) => {
    if (text.length > MAX_DOCUMENT_BYTES) return { ok: false, error: "document is too large" };
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return { ok: false, error: "not valid JSON" };
    }
    return validate(value);
  };
  return { validate, parse: parse2 };
}
var reportCodec = make(analysisReport);
var findingCodec = make(finding);
var diffCodec = make(templateDiff);
var testReportCodec = make(testReport);
var costCodec = make(costEstimate);
var timeSeriesCodec = make(timeSeries);
var planCodec = make(architecturePlan);

// ../../../../packages/safe-output/src/redact.ts
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

// ../../../../packages/safe-output/src/text.ts
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
  let text = sanitizeText(input, true);
  const replace = () => {
    redacted += 1;
    return REDACTED;
  };
  for (const pattern of CREDENTIAL_VALUE) text = text.replace(pattern, replace);
  text = text.replace(BEARER, (_match, scheme) => `${scheme} ${replace()}`);
  text = text.replace(
    SECRET_PAIR,
    (match, name, separator, value) => (
      // A model's token budget (`maxTokens: 200`) is a count, not a credential.
      TOKEN_COUNT_NAME.test(name) && /^\d+$/.test(value) ? match : `${name}${separator}${replace()}`
    )
  );
  if (options.personalData !== false) {
    text = text.replace(EMAIL, replace);
    text = text.replace(CARD, (match) => {
      const digits = match.replace(/[^0-9]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? replace() : match;
    });
  }
  return { text, redacted };
}

// ../../../../packages/template-analysis/src/node.ts
import { readdirSync, statSync } from "node:fs";
import { basename as basename2, isAbsolute as isAbsolute2, join as join2, resolve as resolve2 } from "node:path";

// ../../../../packages/template-analysis/src/data/replacement.json
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

// ../../../../packages/template-analysis/src/catalog.ts
var replacement = replacement_default;
var REPLACEMENT_DATA_SOURCE = replacement.source;
var REPLACEMENT_DATA_DATE = replacement.retrieved;
var SUPPLEMENT_NOTE = replacement.supplement.note;

// ../../../../packages/template-analysis/src/template.ts
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
function resourcesOfType(template, ...types) {
  return Object.values(template.resources).filter((resource) => types.includes(resource.type));
}

// ../../../../packages/template-analysis/src/runtimes.ts
var DEPRECATION = {
  "nodejs24.x": "2028-04-30",
  "nodejs22.x": "2027-04-30",
  "nodejs20.x": "2026-04-30",
  "nodejs18.x": "2025-09-01",
  "nodejs16.x": "2024-06-12",
  "nodejs14.x": "2023-12-04",
  "nodejs12.x": "2023-03-31",
  "nodejs10.x": "2021-07-30",
  "nodejs8.10": "2020-03-06",
  "nodejs6.10": "2019-08-12",
  "nodejs4.3": "2020-03-05",
  "nodejs4.3-edge": "2020-03-05",
  nodejs: "2016-08-30",
  "python3.14": "2029-06-30",
  "python3.13": "2029-06-30",
  "python3.12": "2028-10-31",
  "python3.11": "2027-06-30",
  "python3.10": "2026-10-31",
  "python3.9": "2025-12-15",
  "python3.8": "2024-10-14",
  "python3.7": "2023-12-04",
  "python3.6": "2022-07-18",
  "python2.7": "2021-07-15",
  java25: "2029-06-30",
  java21: "2029-06-30",
  "java17.al2023": "2029-06-30",
  "java11.al2023": "2029-06-30",
  "java8.al2023": "2029-06-30",
  java17: "2027-06-30",
  java11: "2027-06-30",
  "java8.al2": "2027-06-30",
  java8: "2024-01-08",
  dotnet10: "2028-11-14",
  dotnet9: "2026-11-10",
  dotnet8: "2026-11-10",
  dotnet7: "2024-05-14",
  dotnet6: "2024-12-20",
  "dotnet5.0": "2022-05-10",
  "dotnetcore3.1": "2023-04-03",
  "dotnetcore2.1": "2022-01-05",
  "dotnetcore2.0": "2019-05-30",
  "dotnetcore1.0": "2019-06-27",
  "ruby4.0": "2029-03-31",
  "ruby3.4": "2028-03-31",
  "ruby3.3": "2027-03-31",
  "ruby3.2": "2026-03-31",
  "ruby2.7": "2023-12-07",
  "ruby2.5": "2021-07-30",
  "provided.al2023": "2029-06-30",
  "provided.al2": "2026-07-31",
  provided: "2024-01-08",
  "go1.x": "2024-01-08"
};
var PREVIEW = /* @__PURE__ */ new Set(["nodejs26.x", "python3.15"]);
var APPROACHING_DAYS = 180;
function runtimeStatus(identifier, now) {
  if (PREVIEW.has(identifier)) return { state: "preview", deprecationDate: null };
  const date = DEPRECATION[identifier];
  if (date === void 0) return { state: "unknown", deprecationDate: null };
  const ends = Date.parse(`${date}T00:00:00Z`);
  if (ends <= now.getTime()) return { state: "deprecated", deprecationDate: date };
  const days = (ends - now.getTime()) / 864e5;
  return { state: days <= APPROACHING_DAYS ? "approaching" : "supported", deprecationDate: date };
}

// ../../../../packages/tool-runner/src/index.ts
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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

// ../../../../packages/template-analysis/src/node.ts
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

// ../../../../packages/plugin-kit/src/cli.ts
import { closeSync as closeSync2, mkdirSync, openSync as openSync2, writeSync } from "node:fs";
import { dirname as dirname2, isAbsolute as isAbsolute3, resolve as resolve3 } from "node:path";
var usageText = (config) => {
  const width = Math.max(...Object.keys(config.commands).map((c) => c.length)) + 2;
  return `Usage: ${config.name} <command> [options]

${Object.entries(config.commands).map(([name, c]) => `  ${name.padEnd(width)}${c.help}`).join(
    "\n"
  )}

Options: --json${(config.flags ?? []).length > 0 ? `  ${(config.flags ?? []).map((f) => `--${f}`).join("  ")}` : ""}

${config.promise}`;
};
function parse(argv, valued, flags) {
  const words = [];
  const options = /* @__PURE__ */ new Map();
  const set = /* @__PURE__ */ new Set();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (!arg.startsWith("--")) {
      words.push(arg);
      continue;
    }
    const name = arg.slice(2);
    if (name === "json" || flags.includes(name)) set.add(name);
    else if (valued.includes(name)) {
      const value = argv[i + 1];
      if (value === void 0) return `--${name} needs a value`;
      options.set(name, [...options.get(name) ?? [], value]);
      i += 1;
    } else return `unknown option --${name}`;
  }
  return {
    words,
    options,
    flags: set,
    one: (n) => options.get(n)?.[0],
    num: (n, fallback) => {
      const v = options.get(n)?.[0];
      return v === void 0 ? fallback : Number(v);
    }
  };
}
function defineCli(config) {
  const usage = usageText(config);
  return async (argv, deps) => {
    const args = parse(argv, config.valued ?? [], config.flags ?? []);
    if (typeof args === "string") return { exitCode: 2, stdout: `${args}

${usage}` };
    const [command, ...rest] = args.words;
    if (command === void 0) return { exitCode: 2, stdout: `a command is required

${usage}` };
    const handler = Object.hasOwn(config.commands, command) ? config.commands[command] : void 0;
    if (handler === void 0)
      return { exitCode: 2, stdout: `unknown command ${command}

${usage}` };
    const json = args.flags.has("json");
    const resolvePath = (path) => isAbsolute3(path) ? path : resolve3(deps.root, path);
    const ctx = {
      root: deps.root,
      now: deps.now ?? /* @__PURE__ */ new Date(),
      args,
      words: rest,
      json,
      out: (value, text) => ({ exitCode: 0, stdout: json ? JSON.stringify(value, null, 2) : text }),
      fail: (message, exitCode = 1) => ({
        exitCode,
        stdout: exitCode === 2 ? `${message}

${usage}` : message
      }),
      readText: (path, maxBytes = 2e6) => {
        const target = resolvePath(path);
        if (!isInside(deps.root, target))
          return { ok: false, error: `${path} is outside the project` };
        const read = readTextBounded(target, maxBytes);
        return read.kind === "ok" ? { ok: true, text: read.text } : { ok: false, error: `${path} could not be read (${read.kind})` };
      },
      readJson: (path, maxBytes) => {
        const text = ctx.readText(path, maxBytes);
        if (!text.ok) return text;
        try {
          return { ok: true, value: JSON.parse(text.text) };
        } catch {
          return { ok: false, error: `${path} is not valid JSON` };
        }
      },
      save: (path, content) => {
        const target = resolvePath(path);
        if (!isInside(deps.root, target))
          return "Not written: the output path is outside the project";
        try {
          mkdirSync(dirname2(target), { recursive: true });
          if (!isInside(deps.root, target))
            return "Not written: the output path is outside the project";
          const fd = openSync2(target, "wx");
          try {
            writeSync(fd, Buffer.from(content, "utf8"));
          } finally {
            closeSync2(fd);
          }
          return `Created ${target.slice(resolve3(deps.root).length + 1).replaceAll("\\", "/")}`;
        } catch (error) {
          return error.code === "EEXIST" ? `Not written: ${path} already exists; it was not overwritten` : "Not written: the file could not be written";
        }
      },
      stacks: (path) => {
        const loaded = loadStacks(deps.root, path ?? "cdk.out");
        return { stacks: loaded.stacks, problems: loaded.problems };
      }
    };
    try {
      return await handler.run(ctx);
    } catch {
      return { exitCode: 1, stdout: `${config.name} ${command} failed unexpectedly.` };
    }
  };
}
async function runEntry(name, run) {
  try {
    const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
    const result = await run(process.argv.slice(2), { root });
    process.stdout.write(`${result.stdout}
`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(
      `${name} failed (${error instanceof Error ? error.name : "UnknownError"}).
`
    );
    process.exitCode = 1;
  }
}
function staticFinding(plugin, f) {
  return makeFinding({
    ruleId: f.ruleId,
    plugin,
    severity: f.severity,
    status: f.status ?? "confirmed",
    source: "static",
    title: f.title,
    explanation: f.explanation,
    subject: f.subject,
    ...f.resources === void 0 ? {} : { affectedResources: f.resources },
    ...f.recommendation === void 0 ? {} : { recommendation: f.recommendation },
    evidence: [{ type: "template", reference: f.evidenceRef ?? f.subject }]
  });
}
function localReport(plugin, summary, findings, limitations, now) {
  return buildReport({
    plugin,
    context: LOCAL_CONTEXT,
    mode: "local",
    summary,
    findings,
    limitations,
    now
  });
}
var TEMPLATE_LIMITATION = "Templates show what is defined in code, not what is deployed or how it behaves at run time.";
function reportResult(ctx, report, notes = []) {
  return ctx.out(
    report,
    [renderReport(report), ...notes.map((n) => `Note: ${redactText(n).text}`)].join("\n")
  );
}
function eachStack(stacks, fn) {
  return stacks.flatMap((s) => fn(s));
}
var noTemplates = (ctx, problems, path) => ctx.fail(
  problems.join("\n") || `No templates were found in ${path ?? "cdk.out"}. Run /aws-infrastructure:synth first.`
);

// src/lib/cli.ts
import { statSync as statSync2 } from "node:fs";
import { isAbsolute as isAbsolute4, resolve as resolve4 } from "node:path";

// src/lib/invoke.ts
var FUNCTION_NAME = /^(arn:aws[a-z-]*:lambda:[a-z0-9-]+:\d{12}:function:)?[A-Za-z0-9-_]{1,64}(:[A-Za-z0-9-_$]{1,128})?$/;
var REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
var SYNC_LIMIT = 6 * 1024 * 1024;
var ASYNC_LIMIT = 1024 * 1024;
function planInvoke(input) {
  const problems = [];
  if (!FUNCTION_NAME.test(input.fn)) problems.push("The function name or ARN is not valid.");
  if (!REGION.test(input.region)) problems.push("The region is not valid (for example us-east-1).");
  const limit = input.async ? ASYNC_LIMIT : SYNC_LIMIT;
  if (input.payloadBytes > limit)
    problems.push(
      `The payload is ${input.payloadBytes} bytes; a${input.async ? "n asynchronous" : " synchronous"} invocation allows at most ${limit} bytes.`
    );
  if (input.qualifier !== void 0 && !/^[A-Za-z0-9-_$]{1,128}$/.test(input.qualifier))
    problems.push("The qualifier (version or alias) is not valid.");
  const q = input.qualifier === void 0 ? "" : ` --qualifier ${input.qualifier}`;
  const base = `aws lambda invoke --function-name ${input.fn} --region ${input.region}${q} --cli-binary-format raw-in-base64-out --payload fileb://${input.payloadFile}`;
  return {
    ok: problems.length === 0,
    problems,
    command: `${base} --invocation-type ${input.async ? "Event" : "RequestResponse"} response.json`,
    dryRunCommand: `${base} --invocation-type DryRun response.json`,
    effects: [
      "Invoking runs your code with the function's role: it can read and write whatever that role allows, send messages, charge cards, and so on.",
      input.async ? "An asynchronous invocation returns immediately; failures are retried and may run the code more than once." : "A synchronous invocation waits for the result and bills the full duration.",
      "You pay for the invocation. Use a version or alias in a sandbox account, not production data.",
      "Run the DryRun form first: it checks that the parameters are valid and that you have permission, without running the function."
    ]
  };
}
var TOPICS = {
  "memory-cpu": {
    title: "Memory and CPU",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
    points: [
      "Memory is 128 to 10,240 MB. CPU is allocated in proportion to memory: at 1,769 MB a function has the equivalent of one vCPU.",
      "More memory can lower duration enough to lower cost; the only way to know is to measure at several sizes (/aws-cost:compare lambda-memory).",
      "Memory also sets network bandwidth for functions whose limit was raised; see the quotas page."
    ]
  },
  timeout: {
    title: "Timeout",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
    points: [
      "The maximum is 900 seconds (15 minutes).",
      "Set the timeout to what the work needs plus a margin, not the maximum: a hung call then costs less.",
      "For a queue consumer, set the queue's visibility timeout to at least six times the function timeout."
    ]
  },
  "cold-start": {
    title: "Cold starts",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html",
    points: [
      "A cold start is the initialization of a new execution environment: it runs on the first request after idle time and when concurrency scales up.",
      "Create SDK clients outside the handler so warm invocations reuse them.",
      "Reduce package size and imports. Provisioned concurrency or SnapStart (where the runtime supports it) trade cost for fewer cold starts; measure init duration first."
    ]
  },
  architecture: {
    title: "x86_64 or arm64",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/foundation-arch.html",
    points: [
      "arm64 (Graviton) is often cheaper per unit of work; dependencies with native code must be built for arm64.",
      "Test on arm64 before switching. Lambda@Edge does not support arm64."
    ]
  },
  vpc: {
    title: "VPC access",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html",
    points: [
      "A function in a VPC has no internet access unless the subnets route through a NAT gateway; AWS services are reached through VPC endpoints or the NAT.",
      "Only attach a function to a VPC if it must reach resources in it (for example a database).",
      "For relational databases, mind connection counts: use a proxy or reuse connections."
    ]
  },
  concurrency: {
    title: "Concurrency",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/lambda-concurrency.html",
    points: [
      "Each concurrent request uses one execution environment; the function scales by up to 1,000 environments every 10 seconds.",
      "Reserved concurrency caps a function (and keeps that share for it); provisioned concurrency keeps environments warm.",
      "Cap functions that call fragile downstream systems so a spike cannot overwhelm them."
    ]
  },
  versions: {
    title: "Versions and aliases",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html",
    points: [
      "A published version is immutable. An alias points to a version and can shift traffic between two.",
      "Invoke and trigger a version or alias in production, not $LATEST.",
      "Lambda@Edge needs a numbered version."
    ]
  },
  limits: {
    title: "Hard limits to design around",
    source: "https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html",
    points: [
      "Payload: 6 MB request and response (synchronous), 1 MB (asynchronous).",
      "Package: 50 MB zipped when uploaded directly, 250 MB unzipped including layers; container images up to 10 GB.",
      "Environment variables: 4 KB in total. Layers: 5. /tmp: 512 to 10,240 MB."
    ]
  }
};

// src/lib/rules.ts
var PLUGIN = "aws-lambda";
var isRecord3 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var num2 = (v, fallback) => typeof v === "number" ? v : fallback;
var str2 = (v, fallback = "?") => typeof v === "string" ? v : fallback;
var SECRET_NAME = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i;
function inventory(stack, t) {
  return resourcesOfType(t, "AWS::Lambda::Function").map((f) => {
    const env = isRecord3(f.properties["Environment"]) && isRecord3(f.properties["Environment"]["Variables"]) ? Object.keys(f.properties["Environment"]["Variables"]) : [];
    const arch = Array.isArray(f.properties["Architectures"]) ? str2(f.properties["Architectures"][0]) : "x86_64";
    return {
      id: `${stack}/${f.logicalId}`,
      detail: `${str2(f.properties["Runtime"], "image/custom")}, ${arch}, ${num2(f.properties["MemorySize"], 128)} MB, ${num2(f.properties["Timeout"], 3)} s, env keys [${env.join(", ")}]`
    };
  });
}
function rules(stack, t, now) {
  const out = [];
  const at = (id) => `${stack}/${id}`;
  const invokeConfigs = resourcesOfType(t, "AWS::Lambda::EventInvokeConfig").map(
    (c) => JSON.stringify(c.properties["FunctionName"])
  );
  for (const f of resourcesOfType(t, "AWS::Lambda::Function")) {
    const id = at(f.logicalId);
    const runtime = f.properties["Runtime"];
    if (typeof runtime === "string") {
      const s = runtimeStatus(runtime, now);
      if (s.state === "deprecated" || s.state === "approaching")
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "LMB-RUNTIME",
            severity: s.state === "deprecated" ? "high" : "low",
            title: `Runtime ${runtime} is ${s.state === "deprecated" ? "deprecated" : "nearing deprecation"}${s.deprecationDate === null ? "" : ` (${s.deprecationDate})`}`,
            explanation: "A deprecated runtime stops receiving security patches and eventually cannot be updated.",
            subject: id,
            resources: [id],
            recommendation: "Move to a supported runtime. The table is a dated snapshot in template-analysis; confirm on the Lambda runtimes page."
          })
        );
    }
    const mem = num2(f.properties["MemorySize"], 128);
    const timeout = num2(f.properties["Timeout"], 3);
    if (mem < 128 || mem > 10240)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-MEMORY-RANGE",
          severity: "high",
          title: `Memory ${mem} MB is outside 128 to 10,240`,
          explanation: "Lambda accepts 128 to 10,240 MB.",
          subject: id,
          resources: [id]
        })
      );
    if (timeout > 900 || timeout < 1)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-TIMEOUT-RANGE",
          severity: "high",
          title: `Timeout ${timeout} s is outside 1 to 900`,
          explanation: "A standard function can run for at most 900 seconds (15 minutes).",
          subject: id,
          resources: [id]
        })
      );
    if (mem === 128 && timeout >= 30)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-SMALL-MEMORY-LONG-TIMEOUT",
          severity: "low",
          status: "hypothesis",
          title: "128 MB with a long timeout",
          explanation: "CPU scales with memory (about one vCPU at 1,769 MB), so a function with a long timeout and the smallest memory is often slow because it is CPU starved. Measure before changing: a larger size can be both faster and cheaper.",
          subject: id,
          resources: [id],
          recommendation: "Compare durations at several sizes (/aws-cost:compare lambda-memory)."
        })
      );
    const env = isRecord3(f.properties["Environment"]) && isRecord3(f.properties["Environment"]["Variables"]) ? f.properties["Environment"]["Variables"] : {};
    for (const [name, value] of Object.entries(env))
      if (SECRET_NAME.test(name) && typeof value === "string" && value !== "" && !value.startsWith("arn:"))
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "LMB-SECRET-IN-ENV",
            severity: "high",
            title: `Environment variable ${name} looks like a secret with a literal value`,
            explanation: "Environment variables are visible to anyone who can read the function configuration and are stored in the template and its history.",
            subject: `${id}:${name}`,
            resources: [id],
            recommendation: "Store the secret in Secrets Manager or SSM SecureString and read it at run time (store only the name or ARN here)."
          })
        );
    if (JSON.stringify(env).length > 3500)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-ENV-SIZE",
          severity: "medium",
          title: "Environment variables are close to the 4 KB limit",
          explanation: "All environment variables together may use at most 4 KB.",
          subject: id,
          resources: [id]
        })
      );
    if (Array.isArray(f.properties["Layers"]) && f.properties["Layers"].length > 5)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-LAYERS",
          severity: "high",
          title: "More than five layers",
          explanation: "A function may use at most five layers.",
          subject: id,
          resources: [id]
        })
      );
    if (!isRecord3(f.properties["TracingConfig"]) || f.properties["TracingConfig"]["Mode"] !== "Active")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-NO-TRACING",
          severity: "info",
          title: "Active tracing is off",
          explanation: "Without tracing, calls across services are harder to follow.",
          subject: id,
          resources: [id]
        })
      );
    if (!Array.isArray(f.properties["Architectures"]) || !f.properties["Architectures"].includes("arm64"))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-X86",
          severity: "info",
          title: "Runs on x86_64",
          explanation: "arm64 is often cheaper per unit of work and uses less energy; it needs dependencies built for arm64.",
          subject: id,
          resources: [id]
        })
      );
    if (!invokeConfigs.some((c) => c.includes(f.logicalId)) && f.properties["DeadLetterConfig"] === void 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-ASYNC-NO-FAILURE-DEST",
          severity: "low",
          status: "hypothesis",
          title: "No failure destination or dead-letter queue for asynchronous invocations",
          explanation: "If the function is invoked asynchronously (S3, SNS, EventBridge), an event that fails every retry is dropped. Skip this if it is only invoked synchronously or by a queue.",
          subject: id,
          resources: [id],
          recommendation: "Add an EventInvokeConfig with an OnFailure destination, or a DeadLetterConfig."
        })
      );
  }
  for (const u of resourcesOfType(t, "AWS::Lambda::Url"))
    if (u.properties["AuthType"] === "NONE")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "LMB-URL-NO-AUTH",
          severity: "high",
          title: "Function URL has no authentication",
          explanation: "Anyone on the internet can invoke the function, and you pay for each call.",
          subject: at(u.logicalId),
          resources: [at(u.logicalId)],
          recommendation: "Use AuthType AWS_IAM, or put the function behind API Gateway with an authorizer."
        })
      );
  return out;
}

// src/lib/scaffold.ts
var EVENTS = ["sqs", "apigw-http", "eventbridge", "s3", "sns", "scheduled"];
var NAME = /^[a-z][a-z0-9-]{0,40}$/;
var PARSE = {
  sqs: {
    type: "SQSEvent",
    body: `  // Each record is processed on its own. Failures are reported per message so good messages are not retried.
  const failures: { itemIdentifier: string }[] = [];
  for (const record of event.Records) {
    try {
      const message = parseMessage(record.body);
      await handleMessage(message, ctx);
    } catch (error) {
      log.error("message failed", { messageId: record.messageId, error: describe(error) });
      failures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures: failures };`,
    sample: { Records: [{ messageId: "m-1", body: JSON.stringify({ id: "x-1" }) }] }
  },
  "apigw-http": {
    type: "APIGatewayProxyEventV2",
    body: `  try {
    const input = parseMessage(event.body ?? "");
    const result = await handleMessage(input, ctx);
    return json(200, result);
  } catch (error) {
    if (error instanceof ValidationError) return json(400, { message: error.message });
    log.error("request failed", { error: describe(error) });
    return json(500, { message: "internal error" });
  }`,
    sample: {
      version: "2.0",
      routeKey: "POST /items",
      body: JSON.stringify({ id: "x-1" }),
      headers: {}
    }
  },
  eventbridge: {
    type: "EventBridgeEvent<string, unknown>",
    body: `  const message = parseMessage(JSON.stringify(event.detail));
  await handleMessage(message, ctx);`,
    sample: { "detail-type": "ItemCreated.v1", source: "app.items", detail: { id: "x-1" } }
  },
  s3: {
    type: "S3Event",
    body: `  for (const record of event.Records) {
    // Object keys arrive URL-encoded; decode them, and never use one as a file path.
    const key = decodeURIComponent(record.s3.object.key.replace(/\\+/g, " "));
    await handleMessage({ id: key }, ctx);
  }`,
    sample: { Records: [{ s3: { bucket: { name: "b" }, object: { key: "in/a.json" } } }] }
  },
  sns: {
    type: "SNSEvent",
    body: `  for (const record of event.Records) {
    const message = parseMessage(record.Sns.Message);
    await handleMessage(message, ctx);
  }`,
    sample: { Records: [{ Sns: { Message: JSON.stringify({ id: "x-1" }) } }] }
  },
  scheduled: {
    type: "ScheduledEvent",
    body: `  await handleMessage({ id: event.id }, ctx);`,
    sample: { id: "run-1", "detail-type": "Scheduled Event", source: "aws.scheduler" }
  }
};
function scaffold(name, kind) {
  const p = PARSE[kind];
  const handler = `// ${name}: entry point. Keep it thin; the logic lives in handleMessage so it can be tested without AWS.
import type { Context${kind === "sqs" ? ", SQSEvent" : kind === "apigw-http" ? ", APIGatewayProxyEventV2" : kind === "eventbridge" ? ", EventBridgeEvent" : kind === "s3" ? ", S3Event" : kind === "sns" ? ", SNSEvent" : ", ScheduledEvent"} } from "aws-lambda";

export class ValidationError extends Error {}

export interface Message {
  id: string;
}

/** Dependencies are passed in, so tests can replace them and the SDK clients are created once per container. */
export interface Deps {
  /** Return true if this id was already handled. Back it with a conditional write (for example DynamoDB attribute_not_exists). */
  alreadyHandled: (id: string) => Promise<boolean>;
}

const log = {
  info: (message: string, fields: Record<string, unknown> = {}): void => console.log(JSON.stringify({ level: "info", message, ...fields })),
  error: (message: string, fields: Record<string, unknown> = {}): void => console.error(JSON.stringify({ level: "error", message, ...fields })),
};

const describe = (error: unknown): string => (error instanceof Error ? error.name : "UnknownError");

export function parseMessage(text: string): Message {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ValidationError("the body is not valid JSON");
  }
  if (typeof value !== "object" || value === null || typeof (value as { id?: unknown }).id !== "string" || (value as { id: string }).id === "")
    throw new ValidationError("id is required");
  return { id: (value as { id: string }).id };
}

${kind === "apigw-http" ? 'const json = (statusCode: number, body: unknown): { statusCode: number; headers: Record<string, string>; body: string } => ({ statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });\n' : ""}
export async function handleMessage(message: Message, ctx: { deps: Deps }): Promise<{ processed: boolean }> {
  if (await ctx.deps.alreadyHandled(message.id)) {
    log.info("duplicate ignored", { id: message.id });
    return { processed: false };
  }
  // TODO: the business logic goes here.
  log.info("handled", { id: message.id });
  return { processed: true };
}

// Replace this with a real implementation (a conditional DynamoDB write is the usual choice).
const deps: Deps = { alreadyHandled: () => Promise.resolve(false) };

export const handler = async (event: ${p.type}, _context: Context): Promise<${kind === "sqs" ? "{ batchItemFailures: { itemIdentifier: string }[] }" : kind === "apigw-http" ? "{ statusCode: number; headers: Record<string, string>; body: string }" : "void"}> => {
  const ctx = { deps };
${p.body}
};
`;
  const test = `// Runs with the Node test runner: node --test --experimental-strip-types src/handlers/${name}.test.ts
import assert from "node:assert/strict";
import test from "node:test";

import { handleMessage, parseMessage } from "./${name}.ts";

test("parseMessage rejects bad input", () => {
  assert.throws(() => parseMessage("not json"));
  assert.throws(() => parseMessage("{}"));
});

test("a duplicate is ignored and a new message is processed", async () => {
  const seen = new Set<string>();
  const deps = { alreadyHandled: (id: string) => Promise.resolve(seen.has(id) || (seen.add(id), false)) };
  assert.deepEqual(await handleMessage({ id: "a" }, { deps }), { processed: true });
  assert.deepEqual(await handleMessage({ id: "a" }, { deps }), { processed: false });
});
`;
  const local = `// Local harness: runs the handler once with the sample event. It does NOT call Lambda or AWS.
// Run it yourself:  node --experimental-strip-types src/handlers/${name}.local.ts
import { readFileSync } from "node:fs";

import { handler } from "./${name}.ts";

const event = JSON.parse(readFileSync(new URL("./${name}.event.json", import.meta.url), "utf8"));
const result = await handler(event, {} as never);
console.log("local result (not a Lambda invocation):", JSON.stringify(result));
`;
  return {
    files: [
      { path: `src/handlers/${name}.ts`, content: handler },
      { path: `src/handlers/${name}.test.ts`, content: test },
      { path: `src/handlers/${name}.local.ts`, content: local },
      {
        path: `src/handlers/${name}.event.json`,
        content: `${JSON.stringify(p.sample, null, 2)}
`
      }
    ]
  };
}

// src/lib/cli.ts
var runCli = defineCli({
  name: "aws-lambda",
  promise: "Reads files inside the project. Writes only new files with --write. No AWS calls: it invokes no function and changes no configuration.",
  valued: ["name", "event", "function", "region", "payload", "qualifier"],
  flags: ["write", "async"],
  commands: {
    inspect: {
      help: "[path]  Functions in cdk.out with runtime, memory, timeout, env key names, and findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template, ctx.now));
        const report = localReport(
          "aws-lambda",
          `${rows.length} function(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared). Environment variable values are never shown.`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Function code, real durations, and cold start times are not visible in a template."
          ],
          ctx.now
        );
        return reportResult(ctx, report, [
          `Functions:
${rows.map((r) => `  ${r.id}  ${r.detail}`).join("\n")}`,
          ...problems
        ]);
      }
    },
    create: {
      help: "--name <slug> --event sqs|apigw-http|eventbridge|s3|sns|scheduled [--write]  A TypeScript handler with validation, logging, an idempotency hook, a test, and a local harness",
      run: (ctx) => {
        const name = ctx.args.one("name");
        const kind = ctx.args.one("event");
        if (name === void 0 || !NAME.test(name))
          return ctx.fail("create needs --name (lowercase letters, digits, dashes)", 2);
        if (kind === void 0 || !EVENTS.includes(kind))
          return ctx.fail(`create needs --event, one of: ${EVENTS.join(", ")}`, 2);
        const s = scaffold(name, kind);
        if (!ctx.args.flags.has("write"))
          return ctx.out(
            s,
            `${s.files.map((f) => `--- ${f.path}
${f.content}`).join("\n")}
(Draft only; add --write to create these ${s.files.length} files. Types come from @types/aws-lambda, which your project must have.)`
          );
        const lines = s.files.map((f) => ctx.save(f.path, f.content));
        return {
          exitCode: lines.some((l) => l.startsWith("Not written")) ? 1 : 0,
          stdout: [
            ...lines,
            "The local harness runs the handler once with a sample event; it does not invoke Lambda."
          ].join("\n")
        };
      }
    },
    invoke: {
      help: "--function <name|arn> --region <r> --payload <file> [--qualifier v] [--async]  Prepare an invoke command (never run)",
      run: (ctx) => {
        const fn = ctx.args.one("function");
        const region = ctx.args.one("region");
        const payload = ctx.args.one("payload");
        if (fn === void 0 || region === void 0 || payload === void 0)
          return ctx.fail("invoke needs --function, --region, and --payload <file>", 2);
        const read = ctx.readText(payload, 7 * 1024 * 1024);
        if (!read.ok) return ctx.fail(read.error);
        try {
          JSON.parse(read.text);
        } catch {
          return ctx.fail(
            `${payload} is not valid JSON; a malformed payload would fail inside the function`
          );
        }
        const abs = isAbsolute4(payload) ? payload : resolve4(ctx.root, payload);
        let bytes = Buffer.byteLength(read.text);
        try {
          bytes = statSync2(abs).size;
        } catch {
        }
        const q = ctx.args.one("qualifier");
        const plan = planInvoke({
          fn,
          region,
          payloadFile: payload,
          payloadBytes: bytes,
          async: ctx.args.flags.has("async"),
          ...q === void 0 ? {} : { qualifier: q }
        });
        const text = plan.ok ? [
          "NOT RUN. Nothing was invoked. Review, then run it yourself in the right account:",
          `  ${plan.dryRunCommand}   # permission and parameter check only`,
          `  ${plan.command}   # real invocation`,
          "",
          "Before you do:",
          ...plan.effects.map((e) => `  - ${e}`),
          "  - Confirm the account and region with /aws-context:status, and remove secrets from the payload."
        ].join("\n") : `Cannot prepare the invocation:
${plan.problems.map((p) => `  - ${p}`).join("\n")}`;
        return {
          exitCode: plan.ok ? 0 : 1,
          stdout: ctx.json ? JSON.stringify(plan, null, 2) : text
        };
      }
    },
    explain: {
      help: `<topic>  Configuration trade-offs: ${Object.keys(TOPICS).join(", ")}`,
      run: (ctx) => {
        const key = ctx.words[0];
        if (key === void 0)
          return ctx.out(Object.keys(TOPICS), `Topics: ${Object.keys(TOPICS).join(", ")}`);
        const t = Object.hasOwn(TOPICS, key) ? TOPICS[key] : void 0;
        if (t === void 0) return ctx.fail(`unknown topic ${key}`, 2);
        return ctx.out(
          t,
          `${t.title}
${t.points.map((p) => `- ${p}`).join("\n")}
Source: ${t.source}`
        );
      }
    }
  }
});

// src/entries/cli.ts
await runEntry("aws-lambda", runCli);
