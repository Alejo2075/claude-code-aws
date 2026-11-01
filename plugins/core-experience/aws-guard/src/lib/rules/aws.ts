// Classification of `aws` CLI invocations. The rules are data plus a few verb tables, kept in one
// place so every row can be tested. Anything not recognized is `unknown`, which is treated as a
// change: the guard errs toward asking.
import { type Parsed, parseArgs } from "../args.js";
import type { Classification, OpClass } from "../types.js";

const READ_VERBS = new Set([
  "describe",
  "get",
  "list",
  "head",
  "search",
  "lookup",
  "query",
  "scan",
  "select",
  "check",
  "verify",
  "validate",
  "estimate",
  "preview",
  "simulate",
  "filter",
  "detect",
  "tail",
  "show",
  "view",
  "fetch",
  "retrieve",
  "summarize",
  "analyze",
  "count",
  "test",
  "wait",
  "encrypt",
  "decrypt",
  "sign",
  "reencrypt",
  "re",
  "batch-get",
]);
const WRITE_VERBS = new Set([
  "create",
  "put",
  "update",
  "modify",
  "start",
  "run",
  "invoke",
  "send",
  "publish",
  "tag",
  "untag",
  "attach",
  "detach",
  "associate",
  "disassociate",
  "enable",
  "disable",
  "register",
  "set",
  "add",
  "import",
  "copy",
  "restore",
  "reset",
  "rotate",
  "schedule",
  "cancel",
  "stop",
  "reboot",
  "execute",
  "deploy",
  "upload",
  "authorize",
  "revoke",
  "grant",
  "change",
  "replace",
  "allocate",
  "assign",
  "subscribe",
  "unsubscribe",
  "accept",
  "reject",
  "activate",
  "deactivate",
  "apply",
  "write",
  "transact",
  "increase",
  "decrease",
  "resume",
  "pause",
  "suspend",
  "retry",
  "redrive",
  "confirm",
  "complete",
  "initiate",
  "begin",
  "commit",
  "rollback",
  "move",
  "resize",
  "scale",
  "upgrade",
  "downgrade",
  "promote",
  "failover",
  "switch",
  "swap",
  "flush",
  "sync",
  "package",
  "generate",
  "export",
  "batch-write",
  "batch-put",
]);
const DELETE_VERBS = new Set([
  "delete",
  "remove",
  "terminate",
  "deregister",
  "purge",
  "release",
  "destroy",
  "drop",
  "uninstall",
  "unregister",
  "abort",
  "empty",
  "clear",
  "kill",
  "batch-delete",
]);

/** Operations that read or compute even though their verb says otherwise, and the reverse. */
const OVERRIDES: Record<string, OpClass> = {
  "lambda invoke": "write",
  "lambda invoke-async": "write",
  "lambda invoke-with-response-stream": "write",
  "dynamodb execute-statement": "write",
  "dynamodb batch-execute-statement": "write",
  "dynamodb execute-transaction": "write",
  "logs start-query": "read",
  "logs stop-query": "read",
  "logs start-live-tail": "read",
  "ssm start-session": "write",
  "ssm send-command": "write",
  "ssm start-automation-execution": "write",
  "ecs execute-command": "write",
  "athena start-query-execution": "write",
  "apigateway test-invoke-method": "read",
  "cloudformation detect-stack-drift": "read",
  "cloudformation detect-stack-resource-drift": "read",
  "cloudformation validate-template": "read",
  "cloudformation estimate-template-cost": "read",
  "cloudformation deploy": "write",
  "cloudformation package": "write",
  "ec2 get-password-data": "read",
  "kms generate-random": "read",
  "kms generate-data-key": "read",
  "kms generate-data-key-without-plaintext": "read",
  "kms generate-mac": "read",
  "iam generate-credential-report": "read",
  "iam generate-service-last-accessed-details": "read",
  "iam generate-organizations-access-report": "read",
  "ecr get-login-password": "read",
  "sts assume-role": "read",
  "sts assume-role-with-saml": "read",
  "sts assume-role-with-web-identity": "read",
  "sts get-session-token": "read",
  "sts get-federation-token": "read",
  "sts get-caller-identity": "read",
  "stepfunctions start-execution": "write",
  "stepfunctions start-sync-execution": "write",
  "sagemaker-runtime invoke-endpoint": "read",
  "sagemaker-runtime invoke-endpoint-async": "write",
  "cognito-idp admin-initiate-auth": "read",
  "cognito-idp initiate-auth": "read",
};

/** Services whose runtime APIs only compute (no stored state): their operations are reads. */
const READ_ONLY_SERVICES = new Set(["bedrock-runtime"]);

/** Nouns whose deletion is irreversible data or infrastructure loss. */
const STATEFUL_NOUNS = [
  "db-instance",
  "db-cluster",
  "db-snapshot",
  "db-cluster-snapshot",
  "db-parameter-group",
  "global-cluster",
  "table",
  "backup",
  "global-table",
  "bucket",
  "volume",
  "snapshot",
  "file-system",
  "stack",
  "stack-set",
  "stack-instances",
  "domain",
  "stream",
  "queue",
  "topic",
  "log-group",
  "repository",
  "hosted-zone",
  "key",
  "secret",
  "cluster",
  "replication-group",
  "cache-cluster",
  "vault",
  "recovery-point",
  "backup-vault",
  "collection",
  "index",
  "database",
  "workgroup",
  "data-catalog",
  "pipeline",
  "distribution",
  "user-pool",
  "identity-pool",
  "graph",
  "graphql-api",
  "image",
  "ami",
  "instances",
  "instance",
  "file-share",
  "dataset",
  "ledger",
  "broker",
  "server",
  "app",
  "environment",
  "bot",
  "knowledge-base",
  "agent",
  "model",
  "endpoint",
];

/** Destructive flags on an otherwise ordinary operation. */
const DESTRUCTIVE_FLAGS = [
  "force-delete-without-recovery",
  "skip-final-snapshot",
  "delete-automated-backups",
  "force",
  "no-retain-physical-resources",
];

const S3_VALUE_OPTIONS = new Set([
  "profile",
  "region",
  "endpoint-url",
  "exclude",
  "include",
  "acl",
  "sse",
  "sse-kms-key-id",
  "storage-class",
  "metadata",
  "content-type",
  "cache-control",
  "content-disposition",
  "content-encoding",
  "content-language",
  "expires",
  "grants",
  "website-redirect",
  "page-size",
  "expected-size",
  "source-region",
  "request-payer",
  "metadata-directive",
  "output",
  "query",
]);

function verbOf(operation: string): string {
  const parts = operation.split("-");
  const first = parts[0] ?? "";
  if (first === "batch" && parts.length > 1) return `batch-${parts[1] ?? ""}`;
  return first;
}

function nounOf(operation: string): string {
  const parts = operation.split("-");
  return parts.slice(parts[0] === "batch" ? 2 : 1).join("-");
}

function result(cls: OpClass, code: string): Classification {
  return { class: cls, code };
}

function classifyS3(parsed: Parsed, args: readonly string[]): Classification {
  const [, command] = parsed.positionals;
  const s3 = parseArgs(args.slice(args.indexOf("s3") + 1), S3_VALUE_OPTIONS);
  const paths = s3.positionals.slice(1);
  const isS3 = (value: string | undefined): boolean => value?.startsWith("s3://") === true;
  const last = paths.at(-1);
  switch (command) {
    case "ls":
    case "presign":
      return result("read", "AWS_S3_READ");
    case "mb":
    case "website":
      return result("write", "AWS_S3_WRITE");
    case "rb":
      return result("destructive", "AWS_S3_REMOVE_BUCKET");
    case "rm":
      return s3.options.has("recursive")
        ? result("destructive", "AWS_S3_REMOVE_RECURSIVE")
        : result("delete", "AWS_S3_REMOVE");
    case "cp":
      return isS3(last)
        ? result("write", "AWS_S3_COPY_TO_BUCKET")
        : result("read", "AWS_S3_COPY_FROM_BUCKET");
    case "mv":
      return isS3(paths[0])
        ? result("delete", "AWS_S3_MOVE_REMOVES_SOURCE")
        : result("write", "AWS_S3_MOVE_TO_BUCKET");
    case "sync":
      if (s3.options.has("delete")) return result("destructive", "AWS_S3_SYNC_DELETE");
      return isS3(last)
        ? result("write", "AWS_S3_SYNC_TO_BUCKET")
        : result("read", "AWS_S3_SYNC_FROM_BUCKET");
    default:
      return result("unknown", "AWS_UNKNOWN_OPERATION");
  }
}

function classifyConfigure(operation: string | undefined): Classification {
  if (operation === undefined) return result("local", "AWS_CONFIGURE_WIZARD");
  if (["list", "get", "list-profiles", "export-credentials"].includes(operation)) {
    return result("read", "AWS_CONFIGURE_READ");
  }
  return result("local", "AWS_CONFIGURE_WRITE_LOCAL");
}

/** Classifies the arguments that follow `aws`. */
export function classifyAws(args: readonly string[], hasDynamicWords: boolean): Classification {
  const parsed = parseArgs(args);
  const [service, operation] = parsed.positionals;
  if (service === undefined) {
    // `aws --version`, `aws help`
    return result("read", "AWS_NO_SERVICE");
  }
  if (hasDynamicWords && (service.includes("$") || (operation ?? "").includes("$"))) {
    return result("unknown", "AWS_DYNAMIC_OPERATION");
  }
  if (service === "help" || service === "--version" || operation === "help")
    return result("read", "AWS_HELP");
  if (service === "configure") return classifyConfigure(operation);
  if (service === "sso" || service === "login" || service === "logout") {
    return operation !== undefined && operation.startsWith("list")
      ? result("read", "AWS_SSO_READ")
      : result("local", "AWS_SSO_LOCAL");
  }
  if (service === "s3") return classifyS3(parsed, args);
  if (operation === undefined) return result("read", "AWS_SERVICE_HELP");

  const key = `${service} ${operation}`;
  const override = OVERRIDES[key];
  let cls: OpClass;
  let code: string;
  if (override !== undefined) {
    cls = override;
    code = "AWS_OPERATION_RULE";
  } else if (READ_ONLY_SERVICES.has(service)) {
    cls = "read";
    code = "AWS_READ_ONLY_SERVICE";
  } else {
    const verb = verbOf(operation);
    if (READ_VERBS.has(verb)) [cls, code] = ["read", "AWS_VERB_READ"];
    else if (DELETE_VERBS.has(verb)) [cls, code] = ["delete", "AWS_VERB_DELETE"];
    else if (WRITE_VERBS.has(verb)) [cls, code] = ["write", "AWS_VERB_WRITE"];
    else [cls, code] = ["unknown", "AWS_UNKNOWN_OPERATION"];
  }
  if (service === "ec2" && parsed.options.has("dry-run") && cls !== "unknown") {
    return result("read", "AWS_EC2_DRY_RUN");
  }
  if (cls === "delete") {
    const noun = nounOf(operation);
    const stateful =
      service === "iam" ||
      operation === "terminate-instances" ||
      STATEFUL_NOUNS.some((candidate) => noun === candidate || noun.endsWith(`-${candidate}`));
    if (stateful) return result("destructive", "AWS_DELETE_STATEFUL");
  }
  if (operation === "schedule-key-deletion" || operation === "purge-queue") {
    return result("destructive", "AWS_DESTRUCTIVE_OPERATION");
  }
  if (cls !== "read" && DESTRUCTIVE_FLAGS.some((flag) => parsed.options.has(flag))) {
    return result("destructive", "AWS_DESTRUCTIVE_FLAG");
  }
  return result(cls, code);
}
