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
  let hash2 = 0xcbf29ce484222325n;
  for (const char of parts.join("\0")) {
    hash2 ^= BigInt(char.codePointAt(0) ?? 0);
    hash2 = BigInt.asUintN(64, hash2 * 0x100000001b3n);
  }
  return hash2.toString(16).padStart(16, "0");
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
  const parse2 = (text2) => {
    if (text2.length > MAX_DOCUMENT_BYTES) return { ok: false, error: "document is too large" };
    let value;
    try {
      value = JSON.parse(text2);
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

// ../../../../packages/template-analysis/src/graph.ts
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
      out: (value, text2) => ({ exitCode: 0, stdout: json ? JSON.stringify(value, null, 2) : text2 }),
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
        const text2 = ctx.readText(path, maxBytes);
        if (!text2.ok) return text2;
        try {
          return { ok: true, value: JSON.parse(text2.text) };
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

// ../../../../packages/architecture-graph/src/mermaid.ts
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

// ../../../../packages/architecture-graph/src/model.ts
var emptyGraph = (title) => ({
  schemaVersion: "1",
  title,
  nodes: [],
  edges: [],
  notes: []
});

// ../../../../packages/architecture-graph/src/sources.ts
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

// ../../../../packages/content-filter/src/index.ts
var isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var MAX_DEPTH = 20;
var MAX_PATTERN_BYTES = 1e5;
var OPERATORS = [
  "prefix",
  "suffix",
  "anything-but",
  "numeric",
  "exists",
  "cidr",
  "wildcard",
  "equals-ignore-case"
];
function checkPattern(pattern, path = "$", depth = 0) {
  const problems = [];
  if (depth > MAX_DEPTH) return [{ path, message: "pattern is nested too deeply" }];
  if (!isObject(pattern)) return [{ path, message: "a pattern must be an object" }];
  for (const [key, value] of Object.entries(pattern)) {
    const here = `${path}.${key}`;
    if (key === "$or") {
      if (!Array.isArray(value) || value.length === 0)
        problems.push({ path: here, message: "$or must be a non-empty list of patterns" });
      else value.forEach((p, i) => problems.push(...checkPattern(p, `${here}[${i}]`, depth + 1)));
    } else if (Array.isArray(value)) {
      if (value.length === 0) problems.push({ path: here, message: "a rule list cannot be empty" });
      for (const rule of value) {
        if (isObject(rule)) {
          const ops = Object.keys(rule);
          if (ops.length !== 1 || !OPERATORS.includes(ops[0] ?? ""))
            problems.push({
              path: here,
              message: `unknown or combined operator: ${ops.join(", ")}`
            });
          else if (ops[0] === "numeric" && !numericOk(rule["numeric"]))
            problems.push({
              path: here,
              message: "numeric needs [op, number] or [op, number, op, number]"
            });
          else if (ops[0] === "exists" && typeof rule["exists"] !== "boolean")
            problems.push({ path: here, message: "exists needs true or false" });
        } else if (!(rule === null || ["string", "number", "boolean"].includes(typeof rule)))
          problems.push({ path: here, message: "a rule must be a literal or an operator object" });
      }
    } else if (isObject(value)) problems.push(...checkPattern(value, here, depth + 1));
    else
      problems.push({ path: here, message: "a field must be a list of rules or a nested pattern" });
  }
  return problems;
}
function numericOk(v) {
  if (!Array.isArray(v) || v.length !== 2 && v.length !== 4) return false;
  const ops = /* @__PURE__ */ new Set(["<", "<=", ">", ">=", "="]);
  for (let i = 0; i < v.length; i += 2)
    if (!(typeof v[i] === "string" && ops.has(v[i]) && typeof v[i + 1] === "number"))
      return false;
  return true;
}
function wildcardMatch(value, glob) {
  const parts = glob.split("*");
  if (parts.length === 1) return value === glob;
  const first2 = parts[0] ?? "";
  if (!value.startsWith(first2)) return false;
  let pos = first2.length;
  for (let i = 1; i < parts.length - 1; i += 1) {
    const idx = value.indexOf(parts[i] ?? "", pos);
    if (idx < 0) return false;
    pos = idx + (parts[i] ?? "").length;
  }
  const last = parts[parts.length - 1] ?? "";
  return value.length - last.length >= pos && value.endsWith(last);
}
function ipv4(value) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(value);
  if (m === null) return null;
  const parts = m.slice(1).map(Number);
  return parts.some((p) => p > 255) ? null : (parts[0] ?? 0) * 2 ** 24 + (parts[1] ?? 0) * 2 ** 16 + (parts[2] ?? 0) * 256 + (parts[3] ?? 0);
}
function cidrMatch(value, cidr) {
  const [base, bitsText] = cidr.split("/");
  const bits = Number(bitsText);
  const b = ipv4(base ?? "");
  const v = ipv4(value);
  if (b === null || v === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const size = 2 ** (32 - bits);
  return Math.floor(b / size) === Math.floor(v / size);
}
var asList = (v) => Array.isArray(v) ? v : [v];
function textRule(value, op, arg) {
  const ignore = isObject(arg) ? asList(arg["equals-ignore-case"] ?? [])[0] : void 0;
  const ci = typeof ignore === "string" ? ignore : null;
  const want = ci ?? (typeof arg === "string" ? arg : null);
  if (want === null) return false;
  const [v, w] = ci === null ? [value, want] : [value.toLowerCase(), want.toLowerCase()];
  return op === "prefix" ? v.startsWith(w) : v.endsWith(w);
}
function numericMatch(value, spec) {
  for (let i = 0; i < spec.length; i += 2) {
    const op = spec[i];
    const n = spec[i + 1];
    const ok = op === "<" ? value < n : op === "<=" ? value <= n : op === ">" ? value > n : op === ">=" ? value >= n : value === n;
    if (!ok) return false;
  }
  return true;
}
function ruleMatches(rule, value) {
  if (!isObject(rule))
    return rule === value || typeof rule === "number" && typeof value === "number" && rule === value;
  const [op] = Object.keys(rule);
  const arg = rule[op ?? ""];
  switch (op) {
    case "prefix":
    case "suffix":
      return typeof value === "string" && textRule(value, op, arg);
    case "equals-ignore-case":
      return typeof value === "string" && typeof arg === "string" && value.toLowerCase() === arg.toLowerCase();
    case "wildcard":
      return typeof value === "string" && typeof arg === "string" && wildcardMatch(value, arg);
    case "numeric":
      return typeof value === "number" && Array.isArray(arg) && numericMatch(value, arg);
    case "cidr":
      return typeof value === "string" && typeof arg === "string" && cidrMatch(value, arg);
    case "anything-but": {
      if (isObject(arg)) {
        const [inner] = Object.keys(arg);
        const list2 = asList(arg[inner ?? ""]);
        if (typeof value !== "string") return false;
        if (inner === "prefix" || inner === "suffix")
          return !list2.some((x) => textRule(value, inner, x));
        if (inner === "equals-ignore-case")
          return !list2.some(
            (x) => typeof x === "string" && x.toLowerCase() === value.toLowerCase()
          );
        if (inner === "wildcard")
          return !list2.some((x) => typeof x === "string" && wildcardMatch(value, x));
        return false;
      }
      return !asList(arg).some((x) => x === value);
    }
    default:
      return false;
  }
}
function fieldMatches(rules2, value) {
  const exists = rules2.find((r) => isObject(r) && "exists" in r);
  if (value === void 0) return rules2.some((r) => isObject(r) && r["exists"] === false);
  if (rules2.some((r) => isObject(r) && r["exists"] === true) && exists !== void 0) return true;
  const values = Array.isArray(value) ? value : [value];
  return rules2.some((rule) => {
    if (isObject(rule) && "exists" in rule) return false;
    if (isObject(rule) && "anything-but" in rule) return values.every((v) => ruleMatches(rule, v));
    return values.some((v) => ruleMatches(rule, v));
  });
}
function matches(pattern, event, depth = 0) {
  if (depth > MAX_DEPTH) return false;
  if (Array.isArray(event)) return event.some((e) => matches(pattern, e, depth + 1));
  if (!isObject(event)) return false;
  return Object.entries(pattern).every(([key, rule]) => {
    if (key === "$or")
      return Array.isArray(rule) && rule.some((p) => isObject(p) && matches(p, event, depth + 1));
    const value = event[key];
    if (Array.isArray(rule)) return fieldMatches(rule, value);
    if (isObject(rule)) return value !== void 0 && matches(rule, value, depth + 1);
    return false;
  });
}
function explainMiss(pattern, event, path = "$") {
  if (!isObject(event)) return [`${path} is not an object`];
  const out = [];
  for (const [key, rule] of Object.entries(pattern)) {
    if (key === "$or") {
      if (!(Array.isArray(rule) && rule.some((p) => isObject(p) && matches(p, event))))
        out.push(`${path}: none of the $or alternatives match`);
      continue;
    }
    const value = event[key];
    if (Array.isArray(rule)) {
      if (!fieldMatches(rule, value))
        out.push(
          value === void 0 ? `${path}.${key} is missing from the event` : `${path}.${key} = ${JSON.stringify(value)} matches none of ${JSON.stringify(rule)}`
        );
    } else if (isObject(rule)) {
      if (value === void 0) out.push(`${path}.${key} is missing from the event`);
      else out.push(...explainMiss(rule, value, `${path}.${key}`));
    }
  }
  return out;
}

// src/lib/rules.ts
var PLUGIN = "aws-events";
var isRecord4 = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
function inventory(stack, t) {
  const rows = [];
  for (const b of resourcesOfType(t, "AWS::Events::EventBus"))
    rows.push({
      kind: "bus",
      id: `${stack}/${b.logicalId}`,
      detail: typeof b.properties["Name"] === "string" ? b.properties["Name"] : "(name from template)"
    });
  for (const r of resourcesOfType(t, "AWS::Events::Rule")) {
    const targets = Array.isArray(r.properties["Targets"]) ? r.properties["Targets"].length : 0;
    const what = r.properties["ScheduleExpression"] !== void 0 ? `schedule ${JSON.stringify(r.properties["ScheduleExpression"])}` : "event pattern";
    rows.push({
      kind: "rule",
      id: `${stack}/${r.logicalId}`,
      detail: `${what}, ${targets} target(s), state ${typeof r.properties["State"] === "string" ? r.properties["State"] : "ENABLED"}`
    });
  }
  for (const s of resourcesOfType(t, "AWS::Scheduler::Schedule")) {
    const tz = typeof s.properties["ScheduleExpressionTimezone"] === "string" ? s.properties["ScheduleExpressionTimezone"] : "UTC";
    rows.push({
      kind: "schedule",
      id: `${stack}/${s.logicalId}`,
      detail: `${JSON.stringify(s.properties["ScheduleExpression"])} in ${tz}`
    });
  }
  return rows;
}
function rules(stack, t) {
  const out = [];
  const at = (id) => `${stack}/${id}`;
  for (const r of resourcesOfType(t, "AWS::Events::Rule")) {
    const targets = Array.isArray(r.properties["Targets"]) ? r.properties["Targets"].filter(isRecord4) : [];
    if (r.properties["EventPattern"] === void 0 && r.properties["ScheduleExpression"] === void 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-RULE-NO-TRIGGER",
          severity: "medium",
          title: "Rule has neither an event pattern nor a schedule",
          explanation: "A rule without either never fires.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)],
          recommendation: "Add an EventPattern or a ScheduleExpression."
        })
      );
    if (r.properties["State"] === "DISABLED")
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-RULE-DISABLED",
          severity: "info",
          title: "Rule is disabled",
          explanation: "The rule is defined but does not deliver events.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)]
        })
      );
    const pattern = r.properties["EventPattern"];
    if (isRecord4(pattern) && Object.keys(pattern).length === 1 && pattern["source"] !== void 0)
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-PATTERN-BROAD",
          severity: "low",
          status: "hypothesis",
          title: "Pattern matches every event from a source",
          explanation: "A pattern with only `source` forwards all events from that source, which may cost more and trigger targets on events you did not intend.",
          subject: at(r.logicalId),
          resources: [at(r.logicalId)],
          recommendation: "Add `detail-type` or `detail` filters."
        })
      );
    targets.forEach((target, i) => {
      if (!isRecord4(target["DeadLetterConfig"]))
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EVT-TARGET-NO-DLQ",
            severity: "medium",
            title: "Rule target has no dead-letter queue",
            explanation: "If delivery to the target fails after the retries, the event is dropped.",
            subject: `${at(r.logicalId)}#${i}`,
            resources: [at(r.logicalId)],
            recommendation: "Set DeadLetterConfig to an SQS queue, and alarm on its depth."
          })
        );
      const retry = target["RetryPolicy"];
      if (isRecord4(retry) && retry["MaximumRetryAttempts"] === 0)
        out.push(
          staticFinding(PLUGIN, {
            ruleId: "EVT-TARGET-NO-RETRY",
            severity: "low",
            title: "Target retries are turned off",
            explanation: "With zero retry attempts, a transient failure loses the event unless a dead-letter queue catches it.",
            subject: `${at(r.logicalId)}#${i}`,
            resources: [at(r.logicalId)]
          })
        );
    });
  }
  for (const s of resourcesOfType(t, "AWS::Scheduler::Schedule")) {
    if (s.properties["ScheduleExpressionTimezone"] === void 0 && typeof s.properties["ScheduleExpression"] === "string" && s.properties["ScheduleExpression"].startsWith("cron("))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-SCHEDULE-UTC-DEFAULT",
          severity: "low",
          title: "Cron schedule has no time zone",
          explanation: "Without ScheduleExpressionTimezone the cron runs in UTC. If the business meaning is local time, it will drift by an hour across daylight saving changes.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)],
          recommendation: "Set ScheduleExpressionTimezone to the intended IANA zone."
        })
      );
    const target = s.properties["Target"];
    if (isRecord4(target) && !isRecord4(target["DeadLetterConfig"]))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-SCHEDULE-NO-DLQ",
          severity: "low",
          title: "Schedule target has no dead-letter queue",
          explanation: "A failed invocation is retried and then dropped without a record.",
          subject: at(s.logicalId),
          resources: [at(s.logicalId)]
        })
      );
  }
  for (const p of resourcesOfType(t, "AWS::Events::EventBusPolicy")) {
    const principal = p.properties["Principal"];
    const statement = p.properties["Statement"];
    if (principal === "*" || isRecord4(statement) && (statement["Principal"] === "*" || isRecord4(statement["Principal"]) && statement["Principal"]["AWS"] === "*" && statement["Condition"] === void 0))
      out.push(
        staticFinding(PLUGIN, {
          ruleId: "EVT-BUS-POLICY-OPEN",
          severity: "high",
          title: "Event bus policy allows any principal",
          explanation: "Any AWS account may be able to put events on this bus.",
          subject: at(p.logicalId),
          resources: [at(p.logicalId)],
          recommendation: "Name the accounts, or add a condition such as aws:PrincipalOrgID."
        })
      );
  }
  return out;
}
var ENVELOPE = {
  source: "company.domain.service",
  "detail-type": "OrderPlaced.v1",
  detail: {
    metadata: {
      eventId: "uuid",
      occurredAt: "2026-01-01T00:00:00Z",
      schemaVersion: "1",
      correlationId: "uuid",
      producer: "orders-service"
    },
    data: { orderId: "o-123" }
  }
};
var ENVELOPE_GUIDANCE = [
  "Put the version in `detail-type` (OrderPlaced.v1) so a rule can match one version, and add a field only in a backwards compatible way.",
  "Keep identity and tracing in `detail.metadata` and business data in `detail.data`, so consumers can route on metadata without parsing data.",
  "Include a unique eventId: consumers are at-least-once and need it to ignore duplicates.",
  "Do not put secrets or personal data in events: they are copied to every target and to archives.",
  "The whole event is limited in size; send an identifier and let the consumer fetch large content."
];

// src/lib/schedule.ts
var MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
var DOW = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
function field(text2, min, max, names2, offset = 0) {
  const out = /* @__PURE__ */ new Set();
  for (const part of text2.split(",")) {
    const [rangeText, stepText] = part.split("/");
    const step = stepText === void 0 ? 1 : Number(stepText);
    if (!Number.isInteger(step) || step < 1) return `bad step in "${part}"`;
    const num2 = (t) => {
      const idx = names2?.indexOf(t.toUpperCase()) ?? -1;
      return idx >= 0 ? idx + offset : Number(t);
    };
    let lo;
    let hi;
    if (rangeText === "*") [lo, hi] = [min, max];
    else if (rangeText?.includes("-")) {
      const [a, b] = rangeText.split("-");
      [lo, hi] = [num2(a ?? ""), num2(b ?? "")];
    } else {
      lo = num2(rangeText ?? "");
      hi = stepText === void 0 ? lo : max;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi)
      return `value out of range in "${part}" (allowed ${min}-${max})`;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}
function parseSchedule(expression) {
  const text2 = expression.trim();
  if (text2.length > 200) return { ok: false, error: "the expression is too long" };
  const at = /^at\((\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\)$/.exec(text2);
  if (at !== null)
    return Number.isNaN(Date.parse(`${at[1]}Z`)) ? { ok: false, error: "at() is not a valid date and time" } : { ok: true, value: { kind: "at", local: at[1] ?? "" } };
  const rate = /^rate\((\d+) (minute|minutes|hour|hours|day|days)\)$/.exec(text2);
  if (rate !== null) {
    const value = Number(rate[1]);
    const unit = (rate[2] ?? "").replace(/s$/, "");
    if (value < 1) return { ok: false, error: "rate value must be at least 1" };
    if (value === 1 && (rate[2] ?? "").endsWith("s"))
      return { ok: false, error: `use the singular unit when the value is 1: rate(1 ${unit})` };
    if (value > 1 && !(rate[2] ?? "").endsWith("s"))
      return {
        ok: false,
        error: `use the plural unit when the value is more than 1: rate(${value} ${unit}s)`
      };
    return { ok: true, value: { kind: "rate", value, unit } };
  }
  const cron = /^cron\(([^)]*)\)$/.exec(text2);
  if (cron === null)
    return {
      ok: false,
      error: "expected at(yyyy-mm-ddThh:mm:ss), rate(value unit), or cron(minutes hours day-of-month month day-of-week year)"
    };
  const f = (cron[1] ?? "").trim().split(/\s+/);
  if (f.length !== 6)
    return {
      ok: false,
      error: `cron needs 6 fields (minutes hours day-of-month month day-of-week year); got ${f.length}`
    };
  const [mi, ho, dm, mo, dw, yr] = f;
  for (const unsupported of [dm, dw])
    if (/[W#]|\dL|L\d/.test(unsupported))
      return {
        ok: false,
        error: `"${unsupported}" uses W, #, or an offset L, which this checker does not evaluate`
      };
  if (dm === "?" === (dw === "?"))
    return { ok: false, error: "exactly one of day-of-month and day-of-week must be ?" };
  const minutes = field(mi, 0, 59);
  const hours = field(ho, 0, 23);
  const months = field(mo, 1, 12, MONTHS, 1);
  const years = yr === "*" ? null : field(yr, 1970, 2199);
  const dom = dm === "?" ? "?" : dm === "L" ? "L" : field(dm, 1, 31);
  const dow = dw === "?" ? "?" : field(dw, 1, 7, DOW, 1);
  for (const x of [minutes, hours, months, years, dom, dow])
    if (typeof x === "string" && x !== "?" && x !== "L") return { ok: false, error: x };
  return {
    ok: true,
    value: {
      kind: "cron",
      minutes,
      hours,
      dom,
      months,
      dow,
      years
    }
  };
}
function offsetMinutes(zone, at) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(new Date(at));
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return (Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  ) - Math.floor(at / 1e3) * 1e3) / 6e4;
}
function validZone(zone) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
function localToUtc(zone, y, mo, d, h, mi) {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const candidates = /* @__PURE__ */ new Set();
  for (const probe of [naive - 864e5, naive, naive + 864e5]) {
    const guess = naive - offsetMinutes(zone, probe) * 6e4;
    if (naive === guess + offsetMinutes(zone, guess) * 6e4) candidates.add(guess);
  }
  const list2 = [...candidates].sort((a, b) => a - b);
  const first2 = list2[0];
  return first2 === void 0 ? null : { utc: first2, ambiguous: list2.length > 1 };
}
var fmt = (ms) => new Date(ms).toISOString().replace(".000Z", "Z");
var pad = (n) => String(n).padStart(2, "0");
function nextRuns(parsed, zone, from, count) {
  const runs = [];
  if (parsed.kind === "at") {
    const [d, t] = parsed.local.split("T");
    const [y, mo, da] = (d ?? "").split("-").map(Number);
    const [h, mi] = (t ?? "").split(":").map(Number);
    const r = localToUtc(zone, y ?? 0, mo ?? 0, da ?? 0, h ?? 0, mi ?? 0);
    if (r === null) return [];
    return r.utc >= from.getTime() ? [{ utc: fmt(r.utc), local: parsed.local }] : [];
  }
  if (parsed.kind === "rate") {
    const step = parsed.value * { minute: 6e4, hour: 36e5, day: 864e5 }[parsed.unit];
    for (let i = 1; i <= count; i += 1) {
      const t = from.getTime() + i * step;
      runs.push({
        utc: fmt(t),
        local: new Date(t + offsetMinutes(zone, t) * 6e4).toISOString().slice(0, 19)
      });
    }
    return runs;
  }
  const startLocal = new Date(from.getTime() + offsetMinutes(zone, from.getTime()) * 6e4);
  let day = Date.UTC(
    startLocal.getUTCFullYear(),
    startLocal.getUTCMonth(),
    startLocal.getUTCDate()
  );
  for (let guard = 0; guard < 366 * 5 && runs.length < count; guard += 1, day += 864e5) {
    const d = new Date(day);
    const y = d.getUTCFullYear();
    const mo = d.getUTCMonth() + 1;
    const dom = d.getUTCDate();
    const dow = d.getUTCDay() + 1;
    const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (!parsed.months.has(mo) || parsed.years !== null && !parsed.years.has(y)) continue;
    if (parsed.dom === "L" ? dom !== last : parsed.dom !== "?" && !parsed.dom.has(dom)) continue;
    if (parsed.dow !== "?" && !parsed.dow.has(dow)) continue;
    for (const h of [...parsed.hours].sort((a, b) => a - b))
      for (const mi of [...parsed.minutes].sort((a, b) => a - b)) {
        const r = localToUtc(zone, y, mo, dom, h, mi);
        const local = `${y}-${pad(mo)}-${pad(dom)}T${pad(h)}:${pad(mi)}`;
        if (r === null) {
          if (runs.length < count)
            runs.push({
              utc: "(none)",
              local,
              note: "this local time does not exist on that day (clocks move forward); check how Scheduler treats it"
            });
          continue;
        }
        if (r.utc < from.getTime()) continue;
        if (runs.length < count)
          runs.push({
            utc: fmt(r.utc),
            local,
            ...r.ambiguous ? {
              note: "this local time occurs twice (clocks move back); the earlier one is shown"
            } : {}
          });
      }
  }
  return runs.slice(0, count);
}

// src/lib/cli.ts
var EVENT_KINDS = /* @__PURE__ */ new Set([
  "bus",
  "rule",
  "queue",
  "topic",
  "function",
  "state-machine",
  "stream",
  "delivery-stream",
  "bucket"
]);
var runCli = defineCli({
  name: "aws-events",
  promise: "Reads files inside the project. Writes nothing. No AWS calls: it publishes no events and creates no rules or schedules.",
  valued: ["tz", "count", "from"],
  commands: {
    inspect: {
      help: "[path]  Buses, rules, targets, and schedules in cdk.out, with findings",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const rows = eachStack(stacks, (s) => inventory(s.name, s.template));
        const findings = eachStack(stacks, (s) => rules(s.name, s.template));
        const report = localReport(
          "aws-events",
          `${rows.length} bus/rule/schedule resource(s) in ${stacks.length} stack(s), ${findings.length} finding(s). Source: synthesized templates (declared).`,
          findings,
          [
            TEMPLATE_LIMITATION,
            "Event patterns are not evaluated against real traffic here; use `test`."
          ],
          ctx.now
        );
        const text2 = [...rows.map((r) => `  ${r.kind.padEnd(9)} ${r.id}  ${r.detail}`)];
        return reportResult(ctx, report, [`Resources:
${text2.join("\n")}`, ...problems]);
      }
    },
    graph: {
      help: "[path]  The bus, rule, and target graph as ArchitectureGraph JSON (for aws-diagrams) and Mermaid",
      run: (ctx) => {
        const { stacks, problems } = ctx.stacks(ctx.words[0]);
        if (stacks.length === 0) return noTemplates(ctx, problems, ctx.words[0]);
        const full = fromStacks(stacks);
        const nodes = full.nodes.filter((n) => EVENT_KINDS.has(n.kind));
        const ids = new Set(nodes.map((n) => n.id));
        const graph = {
          ...full,
          title: "Event routing",
          nodes,
          edges: full.edges.filter((e) => ids.has(e.from) && ids.has(e.to))
        };
        return ctx.out(
          graph,
          `${toMermaid(graph)}

Solid arrows are declared in the templates. Render with /aws-diagrams if installed.`
        );
      }
    },
    test: {
      help: "<pattern.json> <event.json>  Does the event match the pattern? Says which fields miss",
      run: (ctx) => {
        const [p, e] = ctx.words;
        if (p === void 0 || e === void 0)
          return ctx.fail("test needs a pattern file and an event file", 2);
        const pattern = ctx.readJson(p, MAX_PATTERN_BYTES);
        const event = ctx.readJson(e, 1e6);
        if (!pattern.ok) return ctx.fail(pattern.error);
        if (!event.ok) return ctx.fail(event.error);
        const problems = checkPattern(pattern.value);
        if (problems.length > 0)
          return ctx.fail(
            `The pattern is not valid:
${problems.map((x) => `  ${x.path}: ${x.message}`).join("\n")}`
          );
        const ok = matches(pattern.value, event.value);
        const why = ok ? [] : explainMiss(pattern.value, event.value);
        return ctx.out(
          { matches: ok, why },
          ok ? "MATCH: the event matches the pattern.\n(Checked locally. EventBridge itself is the authority; use TestEventPattern for the final word.)" : `NO MATCH:
${why.map((x) => `  ${x}`).join("\n")}
(Checked locally. EventBridge itself is the authority.)`
        );
      }
    },
    schedule: {
      help: "<expression> [--tz Zone] [--count 5] [--from ISO]  Validate at()/rate()/cron() and list the next runs",
      run: (ctx) => {
        const expression = ctx.words.join(" ");
        if (expression === "")
          return ctx.fail("schedule needs an expression, e.g. 'cron(0 12 * * ? *)'", 2);
        const parsed = parseSchedule(expression);
        if (!parsed.ok) return ctx.fail(`Not a valid expression: ${parsed.error}`);
        const zone = ctx.args.one("tz") ?? "UTC";
        if (!validZone(zone))
          return ctx.fail(
            `unknown time zone ${zone}; use an IANA name such as America/New_York`,
            2
          );
        const count = ctx.args.num("count", 5);
        if (!Number.isInteger(count) || count < 1 || count > 50)
          return ctx.fail("--count must be 1 to 50", 2);
        const from = ctx.args.one("from") === void 0 ? ctx.now : new Date(ctx.args.one("from") ?? "");
        if (Number.isNaN(from.getTime())) return ctx.fail("--from must be an ISO date and time", 2);
        const runs = nextRuns(parsed.value, zone, from, count);
        const text2 = [
          `Valid. Time zone ${zone}. Next ${runs.length} run(s) after ${from.toISOString()}:`,
          ...runs.map(
            (r) => `  ${r.utc.padEnd(21)} local ${r.local}${r.note === void 0 ? "" : `  (${r.note})`}`
          ),
          "Computed locally; Scheduler is the authority, especially around daylight saving changes."
        ];
        return ctx.out({ expression, zone, runs }, text2.join("\n"));
      }
    },
    envelope: {
      help: "Print a versioned event envelope and the rules behind it",
      run: (ctx) => ctx.out(
        { envelope: ENVELOPE, guidance: ENVELOPE_GUIDANCE },
        `${JSON.stringify(ENVELOPE, null, 2)}

${ENVELOPE_GUIDANCE.map((g) => `- ${g}`).join("\n")}`
      )
    }
  }
});

// src/entries/cli.ts
await runEntry("aws-events", runCli);
