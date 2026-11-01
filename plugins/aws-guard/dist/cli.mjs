import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// ../../../packages/context-contract/src/text.ts
function trimTrailingSeparators(path, separators = "/") {
  let end = path.length;
  while (end > 0 && separators.includes(path.charAt(end - 1))) end -= 1;
  return path.slice(0, end);
}

// ../../../packages/context-contract/src/bar.ts
function maskAccount(accountId, ascii = false) {
  return `${accountId.slice(0, 4)}${ascii ? "..." : "\u2026"}${accountId.slice(-4)}`;
}

// ../../../packages/context-contract/src/config.ts
var MAX_CONFIG_BYTES = 64 * 1024;

// ../../../packages/context-contract/src/interpret.ts
var FUTURE_SKEW_MS = 6e4;
function interpret(snapshot, now) {
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (snapshot === null) return { state: "not-configured", snapshot: null, isCurrent: false };
  const make = (state) => ({
    state,
    snapshot,
    isCurrent: state === "verified"
  });
  if (snapshot.verification !== "verified" && snapshot.diagnosticCode === "NO_CREDENTIALS" && snapshot.profile === null && snapshot.accountId === null) {
    return make("not-configured");
  }
  if (snapshot.verification === "expired") return make("expired");
  if (snapshot.verification === "error") {
    return make(
      snapshot.diagnosticCode === "OFFLINE" || snapshot.diagnosticCode === "TIMEOUT" ? "offline" : "error"
    );
  }
  if (snapshot.verification === "unverified") return make("unverified");
  const staleAfterMs = snapshot.staleAfter === null ? Number.NaN : Date.parse(snapshot.staleAfter);
  const verifiedAtMs = snapshot.verifiedAt === null ? Number.NaN : Date.parse(snapshot.verifiedAt);
  if (Number.isNaN(staleAfterMs) || Number.isNaN(verifiedAtMs) || nowMs > staleAfterMs || verifiedAtMs > nowMs + FUTURE_SKEW_MS) {
    return make("stale");
  }
  return make("verified");
}

// ../../../packages/context-contract/src/paths.ts
var SNAPSHOT_VERSION_DIR = "v1";
var stripTrailingSeparators = (path) => trimTrailingSeparators(path, "/\\");
function nonEmpty(value) {
  return value !== void 0 && value.trim() !== "" ? value : void 0;
}
function claudeConfigDir(env) {
  const explicit = nonEmpty(env("CLAUDE_CONFIG_DIR"));
  if (explicit) return stripTrailingSeparators(explicit);
  const home = nonEmpty(env("USERPROFILE")) ?? nonEmpty(env("HOME"));
  return home ? `${stripTrailingSeparators(home)}/.claude` : null;
}
function contextRoot(env) {
  const base = claudeConfigDir(env);
  return base ? `${base}/aws-context` : null;
}
function snapshotDir(env) {
  const root = contextRoot(env);
  return root ? `${root}/${SNAPSHOT_VERSION_DIR}` : null;
}
function snapshotPath(env, workspaceId2) {
  const dir = snapshotDir(env);
  return dir ? `${dir}/${workspaceId2}.json` : null;
}

// ../../../packages/context-contract/src/types.ts
var SNAPSHOT_SCHEMA_VERSION = 1;
var ENVIRONMENTS = ["production", "non-production", "unknown"];
var VERIFICATIONS = ["verified", "unverified", "expired", "error"];
var DIAGNOSTIC_CODES = [
  "NO_CREDENTIALS",
  "SSO_EXPIRED",
  "CREDENTIALS_EXPIRED",
  "CREDENTIALS_INVALID",
  "ACCESS_DENIED",
  "REGION_UNRESOLVED",
  "OFFLINE",
  "TIMEOUT",
  "CONFIG_INVALID",
  "UNKNOWN_ERROR"
];

// ../../../packages/context-contract/src/schema.ts
var MAX_SNAPSHOT_BYTES = 16 * 1024;
var KEYS = [
  "schemaVersion",
  "workspaceId",
  "profile",
  "region",
  "accountId",
  "principalArn",
  "environment",
  "verification",
  "verifiedAt",
  "staleAfter",
  "diagnosticCode"
];
var WORKSPACE_ID = /^[0-9a-f]{16}$/;
var ACCOUNT_ID = /^\d{12}$/;
var REGION = /^[a-z]{2}(?:-[a-z]+)+-\d$/;
var ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nullableString(value, test) {
  if (value === null) return null;
  return typeof value === "string" && test(value) ? value : void 0;
}
function hasControlCharacter(text) {
  return Array.from(text).some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
function isIsoUtc(text) {
  return ISO_UTC.test(text) && !Number.isNaN(Date.parse(text));
}
function oneOf(list, value) {
  return list.find((candidate) => candidate === value);
}
function validateSnapshot(value) {
  if (!isRecord(value)) return { ok: false, reason: "not an object" };
  for (const key of Object.keys(value)) {
    if (!KEYS.includes(key)) return { ok: false, reason: "unknown key" };
  }
  for (const key of KEYS) {
    if (!(key in value)) return { ok: false, reason: `missing ${key}` };
  }
  if (value["schemaVersion"] !== SNAPSHOT_SCHEMA_VERSION) {
    return { ok: false, reason: "unsupported schemaVersion" };
  }
  const workspaceId2 = value["workspaceId"];
  if (typeof workspaceId2 !== "string" || !WORKSPACE_ID.test(workspaceId2)) {
    return { ok: false, reason: "invalid workspaceId" };
  }
  const profile = nullableString(
    value["profile"],
    (text) => text.length > 0 && text.length <= 128 && !hasControlCharacter(text)
  );
  const region = nullableString(value["region"], (text) => REGION.test(text));
  const accountId = nullableString(value["accountId"], (text) => ACCOUNT_ID.test(text));
  const principalArn = nullableString(
    value["principalArn"],
    (text) => text.startsWith("arn:") && text.length <= 2048 && !hasControlCharacter(text)
  );
  const verifiedAt = nullableString(value["verifiedAt"], isIsoUtc);
  const staleAfter = nullableString(value["staleAfter"], isIsoUtc);
  const environment = oneOf(ENVIRONMENTS, value["environment"]);
  const verification = oneOf(VERIFICATIONS, value["verification"]);
  const rawDiagnostic = value["diagnosticCode"];
  const diagnosticCode = rawDiagnostic === null ? null : oneOf(DIAGNOSTIC_CODES, rawDiagnostic);
  if (profile === void 0 || region === void 0 || accountId === void 0 || principalArn === void 0 || verifiedAt === void 0 || staleAfter === void 0 || environment === void 0 || verification === void 0 || diagnosticCode === void 0) {
    return { ok: false, reason: "invalid field" };
  }
  if (verification === "verified" && (accountId === null || verifiedAt === null || staleAfter === null)) {
    return { ok: false, reason: "verified without evidence" };
  }
  if (accountId === null && environment !== "unknown") {
    return { ok: false, reason: "environment without account" };
  }
  return {
    ok: true,
    snapshot: {
      schemaVersion: 1,
      workspaceId: workspaceId2,
      profile,
      region,
      accountId,
      principalArn,
      environment,
      verification,
      verifiedAt,
      staleAfter,
      diagnosticCode
    }
  };
}
function parseSnapshot(text) {
  if (text.length > MAX_SNAPSHOT_BYTES) return { ok: false, reason: "too large" };
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid JSON" };
  }
  return validateSnapshot(value);
}

// ../../../packages/context-contract/src/workspace.ts
var WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;
function normalizeWorkspacePath(path) {
  if (WINDOWS_PATH.test(path)) {
    return trimTrailingSeparators(path.replaceAll("\\", "/")).toLowerCase();
  }
  const trimmed = trimTrailingSeparators(path);
  return trimmed === "" ? "/" : trimmed;
}
async function workspaceId(path) {
  const bytes = new TextEncoder().encode(normalizeWorkspacePath(path));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(
    new Uint8Array(digest).subarray(0, 8),
    (byte) => byte.toString(16).padStart(2, "0")
  ).join("");
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

// src/lib/config.ts
var MAX_CONFIG_BYTES2 = 64 * 1024;
var MAX_RULES = 100;
var MAX_PATTERN = 200;
var DEFAULT_CONFIG = {
  rules: [],
  unattended: "deny",
  onUnverified: "ask",
  mcpServers: [],
  warnings: []
};
var CLASSES = /* @__PURE__ */ new Set(["read", "local", "write", "delete", "destructive", "unknown", "any"]);
var ENVIRONMENTS2 = /* @__PURE__ */ new Set(["production", "non-production", "unknown"]);
var RULE_KEYS = /* @__PURE__ */ new Set(["class", "environment", "tool", "command"]);
var TOP_KEYS = /* @__PURE__ */ new Set(["version", "deny", "ask", "unattended", "onUnverified", "mcpServers"]);
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseRules(list, action, warn) {
  if (list === void 0) return [];
  if (!Array.isArray(list)) {
    warn(`${action} must be a list; ignored`);
    return [];
  }
  const rules = [];
  for (const entry of list.slice(0, MAX_RULES)) {
    if (!isRecord2(entry)) {
      warn(`a ${action} rule is not an object; ignored`);
      continue;
    }
    const rule = { action };
    let valid = Object.keys(entry).length > 0;
    for (const [key, value] of Object.entries(entry)) {
      if (!RULE_KEYS.has(key)) {
        warn(`a ${action} rule has an unknown key; the rule was ignored`);
        valid = false;
      } else if (typeof value !== "string" || value === "" || value.length > MAX_PATTERN) {
        warn(`a ${action} rule has an invalid ${key}; the rule was ignored`);
        valid = false;
      } else if (key === "class" && CLASSES.has(value)) rule.class = value;
      else if (key === "environment" && ENVIRONMENTS2.has(value))
        rule.environment = value;
      else if (key === "tool") rule.tool = value;
      else if (key === "command") rule.command = value;
      else {
        warn(`a ${action} rule has an invalid ${key}; the rule was ignored`);
        valid = false;
      }
    }
    if (valid) rules.push(rule);
  }
  if (list.length > MAX_RULES) warn(`only the first ${MAX_RULES} ${action} rules are used`);
  return rules;
}
function parseGuardConfig(text, source) {
  const layer = { rules: [], mcpServers: [], warnings: [] };
  const warn = (message) => {
    layer.warnings.push(`${source} config: ${message}`);
  };
  if (text.length > MAX_CONFIG_BYTES2) {
    warn("file is too large and was ignored");
    return layer;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    warn("is not valid JSON and was ignored");
    return layer;
  }
  if (!isRecord2(value) || value["version"] !== 1) {
    warn("must be a JSON object with version 1; the file was ignored");
    return layer;
  }
  for (const key of Object.keys(value)) {
    if (!TOP_KEYS.has(key)) warn("ignored an unknown top-level key");
  }
  layer.rules = [
    ...parseRules(value["deny"], "deny", warn),
    ...parseRules(value["ask"], "ask", warn)
  ];
  const personalOnly = source === "project";
  for (const key of ["unattended", "onUnverified", "mcpServers"]) {
    if (personalOnly && value[key] !== void 0) {
      warn(`${key} is only honored in the user file; ignored`);
    }
  }
  if (personalOnly) return layer;
  const unattended = value["unattended"];
  if (unattended === "deny" || unattended === "ask") layer.unattended = unattended;
  else if (unattended !== void 0) warn('unattended must be "deny" or "ask"; using the default');
  const onUnverified = value["onUnverified"];
  if (onUnverified === "ask" || onUnverified === "deny" || onUnverified === "ignore") {
    layer.onUnverified = onUnverified;
  } else if (onUnverified !== void 0) {
    warn('onUnverified must be "ask", "deny", or "ignore"; using the default');
  }
  const servers = value["mcpServers"];
  if (servers !== void 0) {
    if (!isRecord2(servers)) warn("mcpServers must be an object; ignored");
    else {
      for (const [name, kind] of Object.entries(servers)) {
        if (kind === "aws" && name.length <= 128) layer.mcpServers.push(name);
        else warn('an mcpServers entry must map a server name to "aws"; ignored');
      }
    }
  }
  return layer;
}
function mergeGuardConfig(user, project) {
  return {
    rules: [...user?.rules ?? [], ...project?.rules ?? []],
    unattended: user?.unattended ?? DEFAULT_CONFIG.unattended,
    onUnverified: user?.onUnverified ?? DEFAULT_CONFIG.onUnverified,
    mcpServers: user?.mcpServers ?? [],
    warnings: [...user?.warnings ?? [], ...project?.warnings ?? []]
  };
}

// src/lib/runtime.ts
var processEnv = (name) => process.env[name];
function currentProjectDir(fallback) {
  const fromClaude = process.env["CLAUDE_PROJECT_DIR"];
  return fromClaude !== void 0 && fromClaude !== "" ? fromClaude : fallback;
}
function userConfigFile(env) {
  const base = claudeConfigDir(env);
  return base === null ? null : `${base}/aws-guard/config.json`;
}
function projectConfigFile(projectDir) {
  return `${projectDir.replace(/[\\/]+$/, "")}/.aws-guard.json`;
}
function readLayer(path, source) {
  if (path === null) return void 0;
  const read = readTextBounded(path, MAX_CONFIG_BYTES2);
  if (read.kind === "missing") return void 0;
  return parseGuardConfig(
    read.kind === "ok" ? read.text : " ".repeat(MAX_CONFIG_BYTES2 + 1),
    source
  );
}
async function loadContext(env, projectDir, mode, now = Date.now()) {
  const config = mergeGuardConfig(
    readLayer(userConfigFile(env), "user"),
    readLayer(projectConfigFile(projectDir), "project")
  );
  const path = snapshotPath(env, await workspaceId(projectDir));
  const read = path === null ? null : readTextBounded(path, MAX_SNAPSHOT_BYTES);
  const parsed = read?.kind === "ok" ? parseSnapshot(read.text) : null;
  const snapshot = parsed?.ok === true ? parsed.snapshot : null;
  const profile = env("AWS_PROFILE")?.trim();
  return {
    identity: interpret(snapshot, now),
    processProfile: profile === void 0 || profile === "" ? null : profile,
    config,
    mode
  };
}

// src/lib/args.ts
var AWS_VALUE_OPTIONS = /* @__PURE__ */ new Set([
  "profile",
  "region",
  "output",
  "endpoint-url",
  "query",
  "ca-bundle",
  "color",
  "cli-read-timeout",
  "cli-connect-timeout",
  "cli-binary-format",
  "cli-input-json",
  "cli-input-yaml",
  "generate-cli-skeleton"
]);
function parseArgs(args, valueOptions = AWS_VALUE_OPTIONS) {
  const positionals = [];
  const options = /* @__PURE__ */ new Map();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        options.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const name = arg.slice(2);
        const next = args[i + 1];
        if (valueOptions.has(name) && next !== void 0) {
          options.set(name, next);
          i += 1;
        } else options.set(name, true);
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const name = arg.slice(1);
      const next = args[i + 1];
      if (valueOptions.has(name) && next !== void 0) {
        options.set(name, next);
        i += 1;
      } else options.set(name, true);
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, options };
}
function optionValue(parsed, name) {
  const value = parsed.options.get(name);
  return typeof value === "string" ? value : null;
}

// src/lib/glob.ts
function globMatch(pattern, text) {
  let p = 0;
  let t = 0;
  let star = -1;
  let mark = 0;
  while (t < text.length) {
    if (p < pattern.length && pattern[p] === "*") {
      star = p;
      mark = t;
      p += 1;
    } else if (p < pattern.length && pattern[p] === text[t]) {
      p += 1;
      t += 1;
    } else if (star >= 0) {
      p = star + 1;
      mark += 1;
      t = mark;
    } else {
      return false;
    }
  }
  while (p < pattern.length && pattern[p] === "*") p += 1;
  return p === pattern.length;
}

// src/lib/redact.ts
var SENSITIVE_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|ACCESS_KEY|SESSION|CREDENTIAL|PRIVATE_KEY|API_KEY)/i;
var SENSITIVE_FLAG = /^--?(password|passwd|secret|secret-string|secret-access-key|session-token|token|api-key|private-key|auth-token)$/i;
var KEY_ID = /\b(AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g;
var SECRET_LIKE = /\b[A-Za-z0-9/+]{40}\b/g;
var MAX_REASON_COMMAND = 160;
function redact(text) {
  const words = text.split(/(\s+)/);
  let previousFlag = false;
  const out = words.map((piece) => {
    if (/^\s+$/.test(piece) || piece === "") return piece;
    if (previousFlag) {
      previousFlag = false;
      return "[redacted]";
    }
    const eq = piece.indexOf("=");
    if (eq > 0 && SENSITIVE_NAME.test(piece.slice(0, eq)))
      return `${piece.slice(0, eq)}=[redacted]`;
    if (SENSITIVE_FLAG.test(piece)) {
      previousFlag = true;
      return piece;
    }
    const flagEq = piece.match(/^(--?[A-Za-z-]+)=/);
    if (flagEq !== null && SENSITIVE_FLAG.test(flagEq[1] ?? "")) return `${flagEq[1]}=[redacted]`;
    return piece;
  });
  return out.join("").replace(KEY_ID, "[redacted]").replace(
    SECRET_LIKE,
    (match) => /\d/.test(match) && /[A-Z]/.test(match) && /[a-z]/.test(match) ? "[redacted]" : match
  );
}
function shorten(text, max = MAX_REASON_COMMAND) {
  const clean = redact(text.replace(/\s+/g, " ").trim());
  return clean.length > max ? `${clean.slice(0, max - 1)}\u2026` : clean;
}

// src/lib/rules/aws.ts
var READ_VERBS = /* @__PURE__ */ new Set([
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
  "batch-get"
]);
var WRITE_VERBS = /* @__PURE__ */ new Set([
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
  "batch-put"
]);
var DELETE_VERBS = /* @__PURE__ */ new Set([
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
  "batch-delete"
]);
var OVERRIDES = {
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
  "cognito-idp initiate-auth": "read"
};
var READ_ONLY_SERVICES = /* @__PURE__ */ new Set(["bedrock-runtime"]);
var STATEFUL_NOUNS = [
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
  "endpoint"
];
var DESTRUCTIVE_FLAGS = [
  "force-delete-without-recovery",
  "skip-final-snapshot",
  "delete-automated-backups",
  "force",
  "no-retain-physical-resources"
];
var S3_VALUE_OPTIONS = /* @__PURE__ */ new Set([
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
  "query"
]);
function verbOf(operation) {
  const parts = operation.split("-");
  const first = parts[0] ?? "";
  if (first === "batch" && parts.length > 1) return `batch-${parts[1] ?? ""}`;
  return first;
}
function nounOf(operation) {
  const parts = operation.split("-");
  return parts.slice(parts[0] === "batch" ? 2 : 1).join("-");
}
function result(cls, code) {
  return { class: cls, code };
}
function classifyS3(parsed, args) {
  const [, command] = parsed.positionals;
  const s3 = parseArgs(args.slice(args.indexOf("s3") + 1), S3_VALUE_OPTIONS);
  const paths = s3.positionals.slice(1);
  const isS3 = (value) => value?.startsWith("s3://") === true;
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
      return s3.options.has("recursive") ? result("destructive", "AWS_S3_REMOVE_RECURSIVE") : result("delete", "AWS_S3_REMOVE");
    case "cp":
      return isS3(last) ? result("write", "AWS_S3_COPY_TO_BUCKET") : result("read", "AWS_S3_COPY_FROM_BUCKET");
    case "mv":
      return isS3(paths[0]) ? result("delete", "AWS_S3_MOVE_REMOVES_SOURCE") : result("write", "AWS_S3_MOVE_TO_BUCKET");
    case "sync":
      if (s3.options.has("delete")) return result("destructive", "AWS_S3_SYNC_DELETE");
      return isS3(last) ? result("write", "AWS_S3_SYNC_TO_BUCKET") : result("read", "AWS_S3_SYNC_FROM_BUCKET");
    default:
      return result("unknown", "AWS_UNKNOWN_OPERATION");
  }
}
function classifyConfigure(operation) {
  if (operation === void 0) return result("local", "AWS_CONFIGURE_WIZARD");
  if (["list", "get", "list-profiles", "export-credentials"].includes(operation)) {
    return result("read", "AWS_CONFIGURE_READ");
  }
  return result("local", "AWS_CONFIGURE_WRITE_LOCAL");
}
function classifyAws(args, hasDynamicWords) {
  const parsed = parseArgs(args);
  const [service, operation] = parsed.positionals;
  if (service === void 0) {
    return result("read", "AWS_NO_SERVICE");
  }
  if (hasDynamicWords && (service.includes("$") || (operation ?? "").includes("$"))) {
    return result("unknown", "AWS_DYNAMIC_OPERATION");
  }
  if (service === "help" || service === "--version" || operation === "help")
    return result("read", "AWS_HELP");
  if (service === "configure") return classifyConfigure(operation);
  if (service === "sso" || service === "login" || service === "logout") {
    return operation !== void 0 && operation.startsWith("list") ? result("read", "AWS_SSO_READ") : result("local", "AWS_SSO_LOCAL");
  }
  if (service === "s3") return classifyS3(parsed, args);
  if (operation === void 0) return result("read", "AWS_SERVICE_HELP");
  const key = `${service} ${operation}`;
  const override = OVERRIDES[key];
  let cls;
  let code;
  if (override !== void 0) {
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
    const stateful = service === "iam" || operation === "terminate-instances" || STATEFUL_NOUNS.some((candidate) => noun === candidate || noun.endsWith(`-${candidate}`));
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

// src/lib/rules/tools.ts
var AWS_TOOLS = /* @__PURE__ */ new Set([
  "aws",
  "cdk",
  "sam",
  "terraform",
  "tofu",
  "terragrunt",
  "eksctl",
  "serverless",
  "sls",
  "pulumi",
  "copilot"
]);
var result2 = (cls, code) => ({ class: cls, code });
function fromTable(tool, verb, table) {
  if (verb === void 0) return result2("read", `${tool.toUpperCase()}_NO_COMMAND`);
  const cls = table[verb];
  return cls === void 0 ? result2("unknown", `${tool.toUpperCase()}_UNKNOWN_COMMAND`) : result2(cls, `${tool.toUpperCase()}_COMMAND`);
}
var CDK_VALUE_OPTIONS = /* @__PURE__ */ new Set([
  "app",
  "a",
  "context",
  "c",
  "profile",
  "role-arn",
  "r",
  "output",
  "o",
  "plugin",
  "p",
  "toolkit-stack-name",
  "build",
  "proxy",
  "ca-bundle-path",
  "qualifier",
  "bootstrap-bucket-name",
  "cloudformation-execution-policies",
  "template",
  "outputs-file",
  "require-approval",
  "parameters",
  "tags",
  "notification-arns",
  "progress",
  "change-set-name",
  "concurrency",
  "exclusively",
  "method",
  "m"
]);
var CDK = {
  ls: "read",
  list: "read",
  synth: "read",
  synthesize: "read",
  diff: "read",
  doctor: "read",
  docs: "read",
  doc: "read",
  context: "read",
  notices: "read",
  metadata: "read",
  acknowledge: "read",
  ack: "read",
  version: "read",
  init: "local",
  migrate: "local",
  deploy: "write",
  bootstrap: "write",
  import: "write",
  watch: "write",
  publish: "write",
  refactor: "write",
  gc: "delete",
  destroy: "destructive"
};
var SAM = {
  validate: "read",
  list: "read",
  logs: "read",
  traces: "read",
  build: "local",
  local: "local",
  init: "local",
  package: "write",
  publish: "write",
  deploy: "write",
  sync: "write",
  pipeline: "write",
  remote: "write",
  delete: "destructive"
};
var TERRAFORM = {
  init: "local",
  fmt: "local",
  validate: "read",
  version: "read",
  providers: "read",
  graph: "read",
  output: "read",
  show: "read",
  console: "read",
  get: "local",
  plan: "read",
  test: "read",
  login: "local",
  logout: "local",
  apply: "write",
  import: "write",
  taint: "write",
  untaint: "write",
  refresh: "write",
  "force-unlock": "write",
  destroy: "destructive"
};
var EKSCTL = {
  get: "read",
  version: "read",
  info: "read",
  utils: "write",
  create: "write",
  upgrade: "write",
  scale: "write",
  set: "write",
  enable: "write",
  disable: "write",
  associate: "write",
  update: "write",
  drain: "write",
  cordon: "write",
  uncordon: "write",
  anywhere: "write",
  delete: "destructive"
};
var SERVERLESS = {
  package: "local",
  print: "local",
  info: "read",
  logs: "read",
  metrics: "read",
  plugin: "local",
  config: "local",
  offline: "local",
  invoke: "write",
  deploy: "write",
  rollback: "write",
  login: "local",
  remove: "destructive"
};
var PULUMI = {
  preview: "read",
  whoami: "read",
  version: "read",
  about: "read",
  logs: "read",
  history: "read",
  config: "local",
  new: "local",
  login: "local",
  logout: "local",
  up: "write",
  refresh: "write",
  import: "write",
  cancel: "write",
  state: "write",
  destroy: "destructive"
};
var COPILOT = {
  ls: "read",
  show: "read",
  status: "read",
  logs: "read",
  package: "local",
  init: "write",
  deploy: "write",
  run: "write",
  delete: "destructive"
};
function classifyTerraform(tool, parsed) {
  const [command, sub] = parsed.positionals;
  if (command === "apply" && (parsed.options.has("destroy") || sub === "-destroy")) {
    return result2("destructive", `${tool.toUpperCase()}_APPLY_DESTROY`);
  }
  if (command === "state") {
    if (sub === "list" || sub === "show" || sub === "pull")
      return result2("read", "TERRAFORM_STATE_READ");
    if (sub === "rm") return result2("destructive", "TERRAFORM_STATE_REMOVE");
    return result2("write", "TERRAFORM_STATE_WRITE");
  }
  if (command === "workspace") {
    if (sub === "list" || sub === "show") return result2("read", "TERRAFORM_WORKSPACE_READ");
    if (sub === "delete") return result2("destructive", "TERRAFORM_WORKSPACE_DELETE");
    return result2("local", "TERRAFORM_WORKSPACE_LOCAL");
  }
  return fromTable(tool, command, TERRAFORM);
}
function classifyTool(tool, args, dynamic) {
  switch (tool) {
    case "aws":
      return classifyAws(args, dynamic);
    case "cdk": {
      const parsed = parseArgs(args, CDK_VALUE_OPTIONS);
      if (parsed.positionals[0] === "diff") {
        const method = optionValue(parsed, "method") ?? optionValue(parsed, "m");
        const templateOnly = method === "template" || parsed.options.has("no-change-set") || parsed.options.has("template");
        return templateOnly ? result2("read", "CDK_DIFF_TEMPLATE") : result2("write", "CDK_DIFF_CHANGE_SET");
      }
      return fromTable("cdk", parsed.positionals[0], CDK);
    }
    case "sam": {
      const parsed = parseArgs(
        args,
        /* @__PURE__ */ new Set([
          "profile",
          "region",
          "config-file",
          "config-env",
          "template",
          "template-file",
          "t"
        ])
      );
      return fromTable("sam", parsed.positionals[0], SAM);
    }
    case "terraform":
    case "tofu": {
      const filtered = args.filter((arg) => !arg.startsWith("-chdir="));
      return classifyTerraform(tool, parseArgs(filtered, /* @__PURE__ */ new Set()));
    }
    case "terragrunt": {
      const filtered = args.filter(
        (arg) => !arg.startsWith("--terragrunt-") && !arg.startsWith("-chdir=")
      );
      const parsed = parseArgs(filtered, /* @__PURE__ */ new Set());
      parsed.positionals = parsed.positionals.filter(
        (word) => word !== "run-all" && word !== "run"
      );
      return classifyTerraform(tool, parsed);
    }
    case "eksctl": {
      const parsed = parseArgs(args, /* @__PURE__ */ new Set(["profile", "region", "name", "cluster", "n", "f"]));
      return fromTable("eksctl", parsed.positionals[0], EKSCTL);
    }
    case "serverless":
    case "sls": {
      const parsed = parseArgs(
        args,
        /* @__PURE__ */ new Set(["stage", "s", "region", "r", "aws-profile", "config", "c"])
      );
      if (parsed.positionals[0] === "invoke" && parsed.positionals[1] === "local") {
        return result2("local", "SERVERLESS_INVOKE_LOCAL");
      }
      return fromTable("serverless", parsed.positionals[0], SERVERLESS);
    }
    case "pulumi": {
      const parsed = parseArgs(args, /* @__PURE__ */ new Set(["stack", "s", "cwd", "C"]));
      const [command, sub] = parsed.positionals;
      if (command === "stack" && (sub === "rm" || sub === "remove"))
        return result2("destructive", "PULUMI_STACK_REMOVE");
      if (command === "stack") return result2("read", "PULUMI_STACK_READ");
      return fromTable("pulumi", command, PULUMI);
    }
    case "copilot": {
      const parsed = parseArgs(args, /* @__PURE__ */ new Set(["name", "n", "app", "a", "env", "e", "profile"]));
      const verb = parsed.positionals.find((word) => word in COPILOT);
      return fromTable("copilot", verb, COPILOT);
    }
    default:
      return result2("unknown", "TOOL_UNKNOWN");
  }
}

// src/lib/types.ts
var CHANGING = /* @__PURE__ */ new Set([
  "write",
  "delete",
  "destructive",
  "unknown"
]);

// src/lib/decide.ts
var CREDENTIAL_ENV = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE"
];
var LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|host\.docker\.internal)$|(^|\.)(localhost|localstack\.cloud)$/i;
function isLocalEndpoint(url) {
  const match = url.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]*@)?(\[[^\]]+\]|[^/:]+)/i);
  return match !== null && LOCAL_HOST.test(match[1] ?? "");
}
function nonEmpty2(value) {
  return value === void 0 || value.trim() === "" ? null : value.trim();
}
function resolveTarget(invocation, context) {
  const parsed = parseArgs(invocation.args);
  const endpoint = optionValue(parsed, "endpoint-url") ?? nonEmpty2(invocation.env["AWS_ENDPOINT_URL"]) ?? Object.entries(invocation.env).find(([name]) => name.startsWith("AWS_ENDPOINT_URL_"))?.[1] ?? null;
  const none = {
    known: false,
    environment: "unknown",
    account: null,
    unknownBecause: null,
    emulator: false
  };
  if (endpoint !== null && isLocalEndpoint(endpoint)) return { ...none, emulator: true };
  if (endpoint !== null) return { ...none, unknownBecause: "the command sets its own endpoint" };
  const credentials = CREDENTIAL_ENV.find((name) => nonEmpty2(invocation.env[name]) !== null);
  if (credentials !== void 0) {
    return {
      ...none,
      unknownBecause: "the command sets its own AWS credentials or credential files"
    };
  }
  const { identity } = context;
  const snapshot = identity.snapshot;
  if (identity.state !== "verified" || snapshot === null || snapshot.accountId === null) {
    return { ...none, unknownBecause: `the AWS identity is not verified (${identity.state})` };
  }
  const flagProfile = optionValue(parsed, "profile");
  const chosen = flagProfile ?? nonEmpty2(invocation.env["AWS_PROFILE"]) ?? invocation.vaultProfile ?? context.processProfile;
  if (chosen !== null && /[$`]/.test(chosen)) {
    return { ...none, unknownBecause: "the command picks its profile with an expansion" };
  }
  if (chosen !== snapshot.profile) {
    return {
      ...none,
      unknownBecause: `the command uses ${chosen === null ? "the default profile" : `profile "${shorten(chosen, 40)}"`}, not the verified ${snapshot.profile === null ? "default profile" : `profile "${shorten(snapshot.profile, 40)}"`}`
    };
  }
  return {
    known: true,
    environment: snapshot.environment,
    account: maskAccount(snapshot.accountId),
    unknownBecause: null,
    emulator: false
  };
}
function summarize(invocation) {
  const positionals = parseArgs(invocation.args).positionals.slice(0, 3);
  return shorten([invocation.tool, ...positionals].join(" "), 100);
}
function ruleMatches(rule, invocation, cls, target) {
  if (rule.class !== void 0 && rule.class !== "any" && rule.class !== cls.class) return false;
  if (rule.tool !== void 0 && rule.tool !== invocation.tool) return false;
  if (rule.environment !== void 0) {
    const environment = target.known ? target.environment : "unknown";
    if (rule.environment !== environment) return false;
  }
  if (rule.command !== void 0) {
    const text = `${invocation.tool} ${invocation.args.join(" ")}`.slice(0, 2e3);
    if (!globMatch(rule.command, text)) return false;
  }
  return true;
}
var NOTE = "This is a guardrail, not an enforcement boundary: IAM and SCPs are.";
function describeTarget(target) {
  if (target.known) {
    return `${target.environment === "unknown" ? "environment not classified" : target.environment}, account ${target.account}`;
  }
  return `target not verified: ${target.unknownBecause ?? "unknown"}`;
}
function decideInvocation(invocation, context) {
  const classification = classifyTool(invocation.tool, invocation.args, invocation.dynamic);
  return decideClassified(invocation, classification, context);
}
function decideClassified(invocation, classification, context) {
  const target = resolveTarget(invocation, context);
  const summary = summarize(invocation);
  const base = { tool: invocation.tool, summary, classification, target };
  const quiet = { ...base, decision: "none", code: null, reason: null };
  if (target.emulator) return quiet;
  const label = `${classification.class} (${summary})`;
  const matched = context.config.rules.filter(
    (rule) => ruleMatches(rule, invocation, classification, target)
  );
  const denyRule = matched.find((rule) => rule.action === "deny");
  if (denyRule !== void 0) {
    return {
      ...base,
      decision: "deny",
      code: "GUARD_DENIED_BY_RULE",
      reason: `aws-guard: ${label} is denied by a rule in your aws-guard configuration. ${NOTE}`
    };
  }
  if (!CHANGING.has(classification.class)) {
    const askRule2 = matched.find((rule) => rule.action === "ask");
    return askRule2 === void 0 ? quiet : {
      ...base,
      decision: "ask",
      code: "GUARD_ASK_BY_RULE",
      reason: `aws-guard: ${label} matches an ask rule in your aws-guard configuration. ${NOTE}`
    };
  }
  if (!target.known && context.config.onUnverified === "deny") {
    return {
      ...base,
      decision: "deny",
      code: "GUARD_TARGET_UNVERIFIED",
      reason: `aws-guard: ${label} is blocked because ${target.unknownBecause ?? "the target is not verified"}. ${NOTE}`
    };
  }
  if (classification.class === "destructive") {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_DESTRUCTIVE",
      reason: `aws-guard: ${label} can destroy data or infrastructure (${describeTarget(target)}). ${NOTE}`
    };
  }
  if (!target.known && context.config.onUnverified === "ask") {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_TARGET_UNVERIFIED",
      reason: `aws-guard: ${label} would change AWS, but ${target.unknownBecause ?? "the target is not verified"}. ${NOTE}`
    };
  }
  if (target.known && target.environment === "production") {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_PRODUCTION_CHANGE",
      reason: `aws-guard: ${label} targets production (account ${target.account}). ${NOTE}`
    };
  }
  const askRule = matched.find((rule) => rule.action === "ask");
  if (askRule !== void 0) {
    return {
      ...base,
      decision: "ask",
      code: "GUARD_ASK_BY_RULE",
      reason: `aws-guard: ${label} matches an ask rule in your aws-guard configuration (${describeTarget(target)}). ${NOTE}`
    };
  }
  return quiet;
}

// src/lib/shell.ts
var MAX_SOURCE = 2e4;
var MAX_DEPTH = 6;
var MAX_COMMANDS = 400;
var KEYWORDS = /* @__PURE__ */ new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "!",
  "{",
  "time",
  "}",
  "fi",
  "done",
  "esac"
]);
var ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
var SPECIAL_PARAMETERS = /* @__PURE__ */ new Set(["@", "*", "?", "!", "#", "-", "$"]);
function findClosingParen(src, from) {
  let depth = 1;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (c === "\\") i += 1;
    else if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") i += 1;
        else if (src[i] === "$" && src[i + 1] === "(") {
          const inner = findClosingParen(src, i + 2);
          if (inner < 0) return -1;
          i = inner;
        }
        i += 1;
      }
    } else if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
function findBacktick(src, from) {
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === "\\") i += 1;
    else if (src[i] === "`") return i;
  }
  return -1;
}
function toCommand(words, piped, exported) {
  let start = 0;
  while (start < words.length && KEYWORDS.has(words[start]?.text ?? "")) start += 1;
  const env = { ...exported };
  while (start < words.length) {
    const text = words[start]?.text ?? "";
    if (!ASSIGNMENT.test(text)) break;
    const eq = text.indexOf("=");
    env[text.slice(0, eq)] = text.slice(eq + 1);
    start += 1;
  }
  const rest = words.slice(start);
  if (rest[0]?.text === "export") {
    for (const word of rest.slice(1)) {
      if (ASSIGNMENT.test(word.text)) {
        const eq = word.text.indexOf("=");
        exported[word.text.slice(0, eq)] = word.text.slice(eq + 1);
      }
    }
  } else if (rest.length === 0) {
    for (const [name, value] of Object.entries(env)) exported[name] = value;
  }
  return { words: rest, env, piped, stdinText: null };
}
function scan(src, depth, state) {
  if (depth > MAX_DEPTH) {
    state.truncated = true;
    return;
  }
  let words = [];
  let cur = "";
  let hasCur = false;
  let dynamic = false;
  let skipWord = false;
  let piped = false;
  let nextPiped = false;
  let hereString = false;
  let declared = [];
  const waiting = [];
  let hereStringText = null;
  const pushWord = () => {
    if (hasCur) {
      if (skipWord) {
        if (hereString) hereStringText = cur;
      } else {
        words.push({ text: cur, dynamic });
      }
      skipWord = false;
      hereString = false;
    }
    cur = "";
    hasCur = false;
    dynamic = false;
  };
  const endCommand = () => {
    pushWord();
    if (words.length > 0 || hereStringText !== null) {
      if (state.commands.length >= MAX_COMMANDS) {
        state.truncated = true;
      } else {
        const command = toCommand(words, piped, state.exported);
        command.stdinText = hereStringText;
        state.commands.push(command);
        for (const spec of declared) waiting.push({ ...spec, owner: command });
      }
    }
    declared = [];
    words = [];
    piped = nextPiped;
    nextPiped = false;
    hereStringText = null;
  };
  const substitute = (inner) => {
    scan(inner, depth + 1, state);
    cur += "$(\u2026)";
    hasCur = true;
    dynamic = true;
  };
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i] ?? "";
    if (c === "\\") {
      if (src[i + 1] === "\n") {
        i += 2;
        continue;
      }
      cur += src[i + 1] ?? "";
      hasCur = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      cur += end < 0 ? src.slice(i + 1) : src.slice(i + 1, end);
      hasCur = true;
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (c === '"') {
      hasCur = true;
      i += 1;
      while (i < n && src[i] !== '"') {
        const d = src[i] ?? "";
        if (d === "\\" && i + 1 < n) {
          const next = src[i + 1] ?? "";
          if ('"\\$`\n'.includes(next)) {
            if (next !== "\n") cur += next;
          } else cur += `\\${next}`;
          i += 2;
        } else if (d === "$" && src[i + 1] === "(") {
          const close = findClosingParen(src, i + 2);
          if (close < 0) {
            state.truncated = true;
            i = n;
          } else {
            substitute(src.slice(i + 2, close));
            i = close + 1;
          }
        } else if (d === "`") {
          const close = findBacktick(src, i + 1);
          if (close < 0) {
            state.truncated = true;
            i = n;
          } else {
            substitute(src.slice(i + 1, close));
            i = close + 1;
          }
        } else if (d === "$" && /[A-Za-z_{0-9]/.test(src[i + 1] ?? "")) {
          dynamic = true;
          cur += d;
          i += 1;
        } else if (d === "$" && SPECIAL_PARAMETERS.has(src[i + 1] ?? "")) {
          dynamic = true;
          cur += d;
          i += 1;
        } else {
          cur += d;
          i += 1;
        }
      }
      i += 1;
      continue;
    }
    if (c === "$") {
      const next = src[i + 1] ?? "";
      if (next === "(") {
        if (src[i + 2] === "(") {
          const close2 = findClosingParen(src, i + 2);
          cur += "$((\u2026))";
          hasCur = true;
          dynamic = true;
          i = close2 < 0 ? n : close2 + 1;
          continue;
        }
        const close = findClosingParen(src, i + 2);
        if (close < 0) {
          state.truncated = true;
          i = n;
        } else {
          substitute(src.slice(i + 2, close));
          i = close + 1;
        }
        continue;
      }
      if (next === "'") {
        const end = src.indexOf("'", i + 2);
        cur += end < 0 ? src.slice(i + 2) : src.slice(i + 2, end);
        hasCur = true;
        i = end < 0 ? n : end + 1;
        continue;
      }
      if (/[A-Za-z_{0-9]/.test(next) || SPECIAL_PARAMETERS.has(next)) {
        dynamic = true;
        hasCur = true;
        cur += c;
        i += 1;
        continue;
      }
      cur += c;
      hasCur = true;
      i += 1;
      continue;
    }
    if (c === "`") {
      const close = findBacktick(src, i + 1);
      if (close < 0) {
        state.truncated = true;
        i = n;
      } else {
        substitute(src.slice(i + 1, close));
        i = close + 1;
      }
      continue;
    }
    if (c === " " || c === "	" || c === "\r") {
      pushWord();
      i += 1;
      continue;
    }
    if (c === "\n") {
      endCommand();
      i += 1;
      while (waiting.length > 0) {
        const spec = waiting.shift();
        if (spec === void 0) break;
        const lines = [];
        while (i < n) {
          const end = src.indexOf("\n", i);
          const line = src.slice(i, end < 0 ? n : end);
          i = end < 0 ? n : end + 1;
          const compare = spec.strip ? line.replace(/^\t+/, "") : line;
          if (compare === spec.delimiter) break;
          lines.push(line);
        }
        spec.owner.stdinText = `${spec.owner.stdinText ?? ""}${lines.join("\n")}
`;
      }
      continue;
    }
    if (c === ";" || c === "(" || c === ")") {
      endCommand();
      i += 1;
      continue;
    }
    if (c === "&") {
      if (src[i + 1] === ">") {
        pushWord();
        i += src[i + 2] === ">" ? 3 : 2;
        skipWord = true;
        continue;
      }
      endCommand();
      i += src[i + 1] === "&" ? 2 : 1;
      continue;
    }
    if (c === "|") {
      const logicalOr = src[i + 1] === "|";
      nextPiped = !logicalOr;
      endCommand();
      i += logicalOr || src[i + 1] === "&" ? 2 : 1;
      continue;
    }
    if (c === "<" || c === ">") {
      if (hasCur && /^\d+$/.test(cur)) {
        cur = "";
        hasCur = false;
      } else pushWord();
      if (c === "<" && src[i + 1] === "<" && src[i + 2] === "<") {
        i += 3;
        skipWord = true;
        hereString = true;
        continue;
      }
      if (c === "<" && src[i + 1] === "<") {
        i += 2;
        const strip = src[i] === "-";
        if (strip) i += 1;
        while (src[i] === " " || src[i] === "	") i += 1;
        let delimiter = "";
        while (i < n && !" 	\n;&|<>()".includes(src[i] ?? "")) {
          delimiter += src[i] ?? "";
          i += 1;
        }
        declared.push({ delimiter: delimiter.replace(/['"\\]/g, ""), strip });
        continue;
      }
      i += c === ">" && src[i + 1] === ">" ? 2 : 1;
      if (src[i] === "&") i += 1;
      skipWord = true;
      continue;
    }
    cur += c;
    hasCur = true;
    i += 1;
  }
  endCommand();
}
function parseShell(source) {
  const state = { commands: [], truncated: false, exported: {} };
  if (source.length > MAX_SOURCE) {
    state.truncated = true;
    scan(source.slice(0, MAX_SOURCE), 0, state);
  } else {
    scan(source, 0, state);
  }
  return { commands: state.commands, truncated: state.truncated };
}

// src/lib/extract.ts
var SHELLS = /* @__PURE__ */ new Set(["bash", "sh", "zsh", "dash", "ksh", "ash", "fish"]);
var PASSTHROUGH = /* @__PURE__ */ new Set([
  "sudo",
  "doas",
  "nohup",
  "command",
  "exec",
  "nice",
  "ionice",
  "stdbuf",
  "builtin",
  "time",
  "watch",
  "setsid"
]);
var CARRIERS = /* @__PURE__ */ new Set(["ssh", "docker", "podman", "kubectl", "su", "runuser", "sg", "script"]);
var RUNNERS = /* @__PURE__ */ new Set(["npx", "bunx", "uvx", "pipx", "pnpx"]);
var PACKAGE_MANAGERS = /* @__PURE__ */ new Set(["npm", "pnpm", "yarn", "bun"]);
var MAX_UNWRAP = 8;
var MAX_DEPTH2 = 5;
var MENTION = /(^|[^\w./-])(aws|cdk|sam|terraform|tofu|terragrunt|eksctl|serverless|sls|pulumi|copilot|aws-vault)(?![\w-])/i;
function mentionsAwsTool(text) {
  return MENTION.test(text);
}
function baseName(word) {
  const slash = Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\"));
  const name = slash >= 0 ? word.slice(slash + 1) : word;
  return name.replace(/\.(exe|cmd|bat)$/i, "");
}
function textOf(words) {
  return words.map((word) => word.text);
}
function skipFlags(words, withValue) {
  let index = 0;
  while (index < words.length) {
    const text = words[index]?.text ?? "";
    if (text === "--") {
      index += 1;
      break;
    }
    if (!text.startsWith("-") || text === "-") break;
    index += withValue.has(text) ? 2 : 1;
  }
  return words.slice(index);
}
function analyze(command, baseEnv, depth, context) {
  let words = command.words;
  const env = { ...baseEnv, ...command.env };
  let vaultProfile = null;
  let dynamicTail = false;
  for (let step = 0; step < MAX_UNWRAP && words.length > 0; step += 1) {
    const head = words[0];
    if (head === void 0) return;
    if (head.dynamic) {
      context.unanalyzable = true;
      return;
    }
    const name = baseName(head.text).toLowerCase();
    const rest = words.slice(1);
    if (PASSTHROUGH.has(name)) {
      words = skipFlags(rest, /* @__PURE__ */ new Set(["-u", "-g", "-n", "-p", "-t", "-c", "-i", "-o", "-e"]));
      continue;
    }
    if (name === "timeout") {
      const flagless = skipFlags(rest, /* @__PURE__ */ new Set(["-s", "-k", "--signal", "--kill-after"]));
      words = flagless.slice(1);
      continue;
    }
    if (name === "env") {
      let index = 0;
      while (index < rest.length) {
        const text = rest[index]?.text ?? "";
        if (text === "-u" || text === "--unset") index += 2;
        else if (text.startsWith("-")) index += 1;
        else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(text)) {
          env[text.slice(0, text.indexOf("="))] = text.slice(text.indexOf("=") + 1);
          index += 1;
        } else break;
      }
      words = rest.slice(index);
      continue;
    }
    if (name === "xargs") {
      dynamicTail = true;
      words = skipFlags(
        rest,
        /* @__PURE__ */ new Set(["-I", "-n", "-P", "-d", "-L", "-s", "-E", "-a", "-l", "-i"])
      );
      continue;
    }
    if (name === "aws-vault") {
      const afterExec = rest[0]?.text === "exec" ? rest.slice(1) : rest;
      let index = 0;
      while (index < afterExec.length && (afterExec[index]?.text ?? "").startsWith("-")) index += 1;
      vaultProfile = afterExec[index]?.text ?? null;
      const dash = afterExec.findIndex((word) => word.text === "--");
      words = dash >= 0 ? afterExec.slice(dash + 1) : afterExec.slice(index + 1);
      continue;
    }
    if (RUNNERS.has(name)) {
      words = skipFlags(rest, /* @__PURE__ */ new Set(["-p", "--package", "-c"]));
      if (words[0]?.text === "aws-cdk")
        words = [{ text: "cdk", dynamic: false }, ...words.slice(1)];
      continue;
    }
    if (PACKAGE_MANAGERS.has(name)) {
      const sub = rest[0]?.text;
      if (sub === "exec" || sub === "dlx" || sub === "x") {
        words = skipFlags(rest.slice(1), /* @__PURE__ */ new Set(["-p", "--package", "-c"]));
        continue;
      }
      if (sub !== void 0 && AWS_TOOLS.has(sub)) {
        words = rest;
        continue;
      }
      return;
    }
    if (SHELLS.has(name)) {
      shellCommand(name, rest, command, env, depth, context);
      return;
    }
    if (name === "eval") {
      const script = textOf(rest).join(" ");
      if (rest.some((word) => word.dynamic)) context.unanalyzable = true;
      recurse(script, env, depth, context);
      return;
    }
    if (name === "source" || name === ".") return;
    if (CARRIERS.has(name)) {
      for (const word of rest) {
        if (/\s/.test(word.text) && mentionsAwsTool(word.text))
          recurse(word.text, env, depth, context);
      }
      return;
    }
    if (AWS_TOOLS.has(name)) {
      const args = textOf(rest);
      context.invocations.push({
        tool: name === "sls" ? "serverless" : name,
        args,
        dynamic: dynamicTail || rest.some((word) => word.dynamic),
        env,
        vaultProfile
      });
      return;
    }
    return;
  }
}
function shellCommand(name, rest, command, env, depth, context) {
  const flagIndex = rest.findIndex((word) => /^-[A-Za-z]*c[A-Za-z]*$/.test(word.text));
  if (flagIndex >= 0) {
    const script = rest.slice(flagIndex + 1).find((word) => !word.text.startsWith("-"));
    if (script === void 0) return;
    if (script.dynamic) context.unanalyzable = true;
    recurse(script.text, env, depth, context);
    return;
  }
  if (command.stdinText !== null) {
    recurse(command.stdinText, env, depth, context);
    return;
  }
  if (command.piped && name !== "") {
    context.unanalyzable = true;
  }
}
function recurse(source, env, depth, context) {
  if (depth >= MAX_DEPTH2) {
    context.truncated = true;
    context.unanalyzable = true;
    return;
  }
  const parsed = parseShell(source);
  if (parsed.truncated) context.truncated = true;
  for (const sub of parsed.commands) analyze(sub, env, depth + 1, context);
}
function extractInvocations(source) {
  const context = { invocations: [], unanalyzable: false, truncated: false };
  recurse(source, {}, 0, context);
  return context;
}

// src/lib/evaluate.ts
var UNATTENDED_MODES = /* @__PURE__ */ new Set(["bypassPermissions", "dontAsk"]);
var RANK = { none: 0, ask: 1, deny: 2 };
var MAX_REASON = 700;
function combine(findings, unanalyzable, context) {
  let top = null;
  for (const finding of findings) {
    if (top === null || RANK[finding.decision] > RANK[top.decision]) top = finding;
  }
  let decision = top?.decision ?? "none";
  let code = top?.code ?? null;
  let reason = top?.reason ?? null;
  if (decision === "none" && unanalyzable) {
    decision = "ask";
    code = "GUARD_UNANALYZABLE";
    reason = "aws-guard: this command mentions an AWS tool but builds or hides what it runs (a variable, a piped script, or deeply nested shells), so it cannot be checked. This is a guardrail, not an enforcement boundary: IAM and SCPs are.";
  }
  if (decision === "ask" && UNATTENDED_MODES.has(context.mode) && context.config.unattended === "deny") {
    const original = reason ?? "";
    decision = "deny";
    code = "GUARD_UNATTENDED";
    reason = `${original} It was blocked instead of asked because permission mode "${context.mode}" may have no one to answer. Run it yourself, or set "unattended": "ask" in your aws-guard configuration.`;
  }
  if (reason !== null && findings.length > 1) {
    const others = findings.filter(
      (finding) => finding !== top && finding.decision !== "none"
    ).length;
    if (others > 0)
      reason = `${reason} (${others} more AWS command(s) in this call also need attention.)`;
  }
  return {
    decision,
    code,
    reason: reason === null ? null : reason.slice(0, MAX_REASON),
    findings
  };
}
function evaluateBash(command, context) {
  const extraction = extractInvocations(command);
  const findings = extraction.invocations.map(
    (invocation) => decideInvocation(invocation, context)
  );
  const unanalyzable = (extraction.unanalyzable || extraction.truncated) && mentionsAwsTool(command);
  return combine(findings, unanalyzable, context);
}

// src/lib/cli.ts
var USAGE = `Usage: aws-guard <command> [--json]

  check [--mode <permission mode>] <command...>   Explain what the guard would decide for a shell
                                                  command. Executes nothing.
  rules                                           Show the effective configuration and warnings

The guard only asks or denies; it never allows, and it is a guardrail, not an enforcement boundary.`;
function describe(verdict) {
  const lines = [
    `Decision:  ${verdict.decision === "none" ? "no decision (the normal permission flow applies)" : verdict.decision}`
  ];
  if (verdict.code !== null) lines.push(`Code:      ${verdict.code}`);
  if (verdict.reason !== null) lines.push(`Reason:    ${verdict.reason}`);
  if (verdict.findings.length === 0) lines.push("No AWS command was found in the input.");
  for (const finding of verdict.findings) {
    const target = finding.target.emulator ? "local emulator" : finding.target.known ? `${finding.target.environment}, account ${finding.target.account}` : `not verified: ${finding.target.unknownBecause ?? "unknown"}`;
    lines.push(
      `- ${finding.summary}: ${finding.classification.class} (${finding.classification.code}); target ${target}`
    );
  }
  return lines.join("\n");
}
function rulesText(context) {
  const { config } = context;
  const lines = [
    `unattended:   ${config.unattended}`,
    `onUnverified: ${config.onUnverified}`,
    `mcpServers:   ${config.mcpServers.length === 0 ? "(none added)" : config.mcpServers.join(", ")}`,
    "",
    "Rules:",
    ...config.rules.length === 0 ? ["  (none; the built-in rules always apply)"] : config.rules.map(
      (rule) => `  ${rule.action}: ${JSON.stringify({ ...rule, action: void 0 })}`
    )
  ];
  if (config.warnings.length > 0)
    lines.push("", "Warnings:", ...config.warnings.map((w) => `  - ${w}`));
  return lines.join("\n");
}
async function runCli(argv, projectDir) {
  const json = argv.includes("--json");
  const words = argv.filter((word) => word !== "--json");
  const [command, ...rest] = words;
  const print = (value, text) => ({
    exitCode: 0,
    stdout: json ? JSON.stringify(value, null, 2) : text
  });
  if (command === "check") {
    let mode = "default";
    const parts = [...rest];
    if (parts[0] === "--mode") {
      mode = parts[1] ?? "default";
      parts.splice(0, 2);
    }
    const text = parts.join(" ").trim();
    if (text === "") return { exitCode: 2, stdout: USAGE };
    const context = await loadContext(processEnv, projectDir, mode);
    const verdict = evaluateBash(text, context);
    return print(verdict, describe(verdict));
  }
  if (command === "rules" && rest.length === 0) {
    const context = await loadContext(processEnv, projectDir, "default");
    return print(context.config, rulesText(context));
  }
  return { exitCode: 2, stdout: USAGE };
}

// src/entries/cli.ts
try {
  const result3 = await runCli(process.argv.slice(2), currentProjectDir(process.cwd()));
  process.stdout.write(`${result3.stdout}
`);
  process.exitCode = result3.exitCode;
} catch (error) {
  process.stderr.write(
    `aws-guard failed (${error instanceof Error ? error.name : "UnknownError"}).
`
  );
  process.exitCode = 1;
}
