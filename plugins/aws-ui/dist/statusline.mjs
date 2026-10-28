import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);

// src/entries/statusline.ts
import { fileURLToPath } from "node:url";

// ../../packages/context-contract/src/bar.ts
var STATE_LABEL = {
  "not-configured": "not configured",
  verified: "verified",
  stale: "stale",
  expired: "expired",
  offline: "offline",
  error: "error",
  unverified: "unverified"
};
function maskAccount(accountId, ascii = false) {
  return `${accountId.slice(0, 4)}${ascii ? "..." : "\u2026"}${accountId.slice(-4)}`;
}
function stateLabel(interpretation) {
  const code = interpretation.snapshot?.diagnosticCode;
  if (interpretation.state === "expired") {
    if (code === "SSO_EXPIRED") return "expired (SSO session)";
    if (code === "CREDENTIALS_EXPIRED") return "expired (credentials)";
  }
  if (interpretation.state === "stale") return "stale (refresh to verify)";
  return STATE_LABEL[interpretation.state];
}
function formatBar(interpretation, options = {}) {
  const ascii = options.ascii === true;
  const separator = ascii ? " | " : " \xB7 ";
  const width = Math.max(10, options.width ?? 200);
  const snapshot = interpretation.snapshot;
  const segments = [{ text: "AWS", priority: 1 }];
  if (interpretation.state === "not-configured" || snapshot === null) {
    segments.push({ text: STATE_LABEL["not-configured"], priority: 9 });
  } else {
    const masked = snapshot.accountId === null ? null : options.maskAccountId === false ? snapshot.accountId : maskAccount(snapshot.accountId, ascii);
    const account = masked === null ? "account unknown" : interpretation.isCurrent ? masked : `last known ${masked}`;
    segments.push({ text: account, priority: 8 });
    segments.push({ text: snapshot.region ?? "region unknown", priority: 5 });
    if (options.showProfile !== false && snapshot.profile !== null) {
      segments.push({ text: `profile: ${snapshot.profile}`, priority: 2 });
    }
    segments.push({ text: snapshot.environment, priority: 7 });
    segments.push({ text: stateLabel(interpretation), priority: 9 });
  }
  const render2 = (list) => list.map((segment) => segment.text).join(separator);
  let kept = segments;
  while (render2(kept).length > width && kept.length > 1) {
    const lowest = Math.min(...kept.map((segment) => segment.priority));
    const index = kept.findIndex((segment) => segment.priority === lowest);
    kept = kept.filter((_, position) => position !== index);
  }
  const line = render2(kept);
  if (line.length <= width) return line;
  const ellipsis = ascii ? "..." : "\u2026";
  return `${line.slice(0, width - ellipsis.length)}${ellipsis}`;
}

// ../../packages/context-contract/src/config.ts
var MAX_CONFIG_BYTES = 64 * 1024;
var ACCOUNT_ID = /^\d{12}$/;
var TOP_LEVEL_KEYS = ["version", "ttlMinutes", "accounts", "ui"];
var UI_KEYS = ["maskAccountId", "showProfile"];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseConfig(text, source) {
  const layer = { source, accounts: {} };
  const warnings = [];
  const warn = (message) => {
    warnings.push(`${source} config: ${message}`);
  };
  if (text.length > MAX_CONFIG_BYTES) {
    warn("file is too large and was ignored");
    return { layer, warnings };
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    warn("is not valid JSON and was ignored");
    return { layer, warnings };
  }
  if (!isRecord(value)) {
    warn("must be a JSON object and was ignored");
    return { layer, warnings };
  }
  if (value["version"] !== 1) {
    warn("version must be 1; the file was ignored");
    return { layer, warnings };
  }
  for (const key of Object.keys(value)) {
    if (!TOP_LEVEL_KEYS.includes(key)) warn("ignored an unknown top-level key");
  }
  const personalOnly = source === "project";
  for (const key of ["ttlMinutes", "ui"]) {
    if (personalOnly && value[key] !== void 0) {
      warn(`${key} is only honored in the user file; ignored`);
    }
  }
  const ttl = personalOnly ? void 0 : value["ttlMinutes"];
  if (ttl !== void 0) {
    if (typeof ttl === "number" && Number.isInteger(ttl) && ttl >= 1 && ttl <= 60) {
      layer.ttlMinutes = ttl;
    } else {
      warn("ttlMinutes must be an integer from 1 to 60; using the default");
    }
  }
  const accounts = value["accounts"];
  if (accounts !== void 0) {
    if (!isRecord(accounts)) {
      warn("accounts must be an object; ignored");
    } else {
      for (const [id, entry] of Object.entries(accounts)) {
        const environment = isRecord(entry) ? entry["environment"] : void 0;
        if (!ACCOUNT_ID.test(id)) {
          warn("ignored an accounts key that is not a 12-digit account id");
        } else if (environment !== "production" && environment !== "non-production") {
          warn(`account ${id}: environment must be "production" or "non-production"; ignored`);
        } else {
          layer.accounts[id] = environment;
        }
      }
    }
  }
  const ui = personalOnly ? void 0 : value["ui"];
  if (ui !== void 0) {
    if (!isRecord(ui)) {
      warn("ui must be an object; ignored");
    } else {
      for (const key of Object.keys(ui)) {
        if (!UI_KEYS.includes(key)) warn("ignored an unknown ui key");
      }
      if (typeof ui["maskAccountId"] === "boolean") layer.maskAccountId = ui["maskAccountId"];
      else if (ui["maskAccountId"] !== void 0) warn("ui.maskAccountId must be a boolean");
      if (typeof ui["showProfile"] === "boolean") layer.showProfile = ui["showProfile"];
      else if (ui["showProfile"] !== void 0) warn("ui.showProfile must be a boolean");
    }
  }
  return { layer, warnings };
}

// ../../packages/context-contract/src/interpret.ts
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

// ../../packages/context-contract/src/text.ts
function trimTrailingSeparators(path, separators = "/") {
  let end = path.length;
  while (end > 0 && separators.includes(path.charAt(end - 1))) end -= 1;
  return path.slice(0, end);
}

// ../../packages/context-contract/src/paths.ts
var SNAPSHOT_VERSION_DIR = "v1";
var stripTrailingSeparators = (path) => trimTrailingSeparators(path, "/\\");
function nonEmpty(value) {
  return value !== void 0 && value.trim() !== "" ? value : void 0;
}
function claudeConfigDir(env2) {
  const explicit = nonEmpty(env2("CLAUDE_CONFIG_DIR"));
  if (explicit) return stripTrailingSeparators(explicit);
  const home = nonEmpty(env2("USERPROFILE")) ?? nonEmpty(env2("HOME"));
  return home ? `${stripTrailingSeparators(home)}/.claude` : null;
}
function contextRoot(env2) {
  const base = claudeConfigDir(env2);
  return base ? `${base}/aws-context` : null;
}
function snapshotDir(env2) {
  const root = contextRoot(env2);
  return root ? `${root}/${SNAPSHOT_VERSION_DIR}` : null;
}
function snapshotPath(env2, workspaceId2) {
  const dir = snapshotDir(env2);
  return dir ? `${dir}/${workspaceId2}.json` : null;
}
function userConfigPath(env2) {
  const root = contextRoot(env2);
  return root ? `${root}/config.json` : null;
}

// ../../packages/context-contract/src/types.ts
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

// ../../packages/context-contract/src/schema.ts
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
var ACCOUNT_ID2 = /^\d{12}$/;
var REGION = /^[a-z]{2}(?:-[a-z]+)+-\d$/;
var ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function isRecord2(value) {
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
  if (!isRecord2(value)) return { ok: false, reason: "not an object" };
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
  const accountId = nullableString(value["accountId"], (text) => ACCOUNT_ID2.test(text));
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

// ../../packages/context-contract/src/workspace.ts
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

// ../../packages/context-contract/src/node.ts
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

// src/lib/statusline-setup.ts
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
function stableScriptPath(env2) {
  const base = claudeConfigDir(env2);
  return base === null ? null : `${base}/aws-ui/statusline.mjs`;
}
function detectStatusLine(env2) {
  const base = claudeConfigDir(env2);
  if (base === null) return { isConfigured: false, command: null };
  const path = `${base}/settings.json`;
  const read = readTextBounded(path, 1e6);
  if (read.kind !== "ok") return { isConfigured: false, command: null };
  try {
    const settings = JSON.parse(read.text);
    const line = typeof settings === "object" && settings !== null ? settings["statusLine"] : void 0;
    if (typeof line !== "object" || line === null) return { isConfigured: false, command: null };
    const command = line["command"];
    return { isConfigured: true, command: typeof command === "string" ? command : null };
  } catch {
    return { isConfigured: false, command: null };
  }
}
function snippet(scriptPath) {
  const command = `node ${JSON.stringify(scriptPath.replaceAll("\\", "/"))}`;
  return JSON.stringify({ statusLine: { type: "command", command, refreshInterval: 10 } }, null, 2);
}
function setup(env2, currentScript, options) {
  const lines = [];
  const existing = detectStatusLine(env2);
  let target = currentScript;
  let copied = false;
  if (options.copy) {
    const stable = stableScriptPath(env2);
    if (stable === null) {
      lines.push("Could not find the Claude config directory, so nothing was copied.");
    } else {
      mkdirSync(join(stable, ".."), { recursive: true });
      copyFileSync(currentScript, stable);
      target = stable;
      copied = true;
      lines.push(`Copied the status-line script to ${stable} (re-run after updating aws-ui).`);
    }
  } else {
    lines.push(
      "This path belongs to the installed plugin version and changes when the plugin updates.",
      "Run `setup --copy` to keep a stable copy under your Claude config directory instead."
    );
  }
  lines.push("", "To turn the status line on, add this to ~/.claude/settings.json yourself:", "");
  lines.push(snippet(target), "");
  if (existing.isConfigured) {
    lines.push(
      "You already have a statusLine configured, and Claude Code supports only one. This plugin did not change it.",
      `Current command: ${existing.command ?? "(not a command)"}`,
      "To keep it, run aws-ui's script from inside your own script and print both lines."
    );
  } else {
    lines.push(
      "You have no statusLine configured, so the snippet above will not replace anything."
    );
  }
  return { text: lines.join("\n"), copied };
}

// src/entries/statusline.ts
var env = (name) => process.env[name];
var WIDTH = 100;
function readText(path, limit) {
  if (path === null) return null;
  const read = readTextBounded(path, limit);
  return read.kind === "ok" ? read.text : null;
}
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
function projectDirOf(raw) {
  try {
    const parsed = JSON.parse(raw);
    const workspace = parsed.workspace;
    const dir = workspace?.project_dir ?? workspace?.current_dir ?? parsed.cwd;
    if (typeof dir === "string" && dir !== "") return dir;
  } catch {
  }
  return process.env["CLAUDE_PROJECT_DIR"] ?? process.cwd();
}
async function render() {
  const projectDir = projectDirOf(await readStdin());
  const path = snapshotPath(env, await workspaceId(projectDir));
  const parsed = (text) => text === null ? null : parseSnapshot(text);
  const snapshotResult = parsed(readText(path, MAX_SNAPSHOT_BYTES));
  const snapshot = snapshotResult?.ok === true ? snapshotResult.snapshot : null;
  const configText = readText(userConfigPath(env), MAX_CONFIG_BYTES);
  const preferences = configText === null ? {} : parseConfig(configText, "user").layer;
  return formatBar(interpret(snapshot, Date.now()), {
    maskAccountId: preferences.maskAccountId ?? true,
    showProfile: preferences.showProfile ?? true,
    width: WIDTH
  });
}
var args = process.argv.slice(2);
try {
  if (args[0] === "setup") {
    const copy = args.includes("--copy");
    process.stdout.write(`${setup(env, fileURLToPath(import.meta.url), { copy }).text}
`);
  } else {
    process.stdout.write(`${await render()}
`);
  }
} catch {
  process.stdout.write(`${formatBar(interpret(null, Date.now()))}
`);
}
