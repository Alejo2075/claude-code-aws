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
function toneOf(interpretation) {
  switch (interpretation.state) {
    case "verified":
      return interpretation.snapshot?.environment === "production" ? "alert" : "ok";
    case "stale":
    case "unverified":
    case "offline":
      return "warn";
    case "expired":
    case "error":
      return "danger";
    case "not-configured":
      return "muted";
  }
}
function formatBar(interpretation, options = {}) {
  const ascii = options.ascii === true;
  const separator = ascii ? " | " : " \xB7 ";
  const width = Math.max(10, options.width ?? 200);
  const snapshot2 = interpretation.snapshot;
  const segments = [{ text: "AWS", priority: 1 }];
  if (interpretation.state === "not-configured" || snapshot2 === null) {
    segments.push({ text: STATE_LABEL["not-configured"], priority: 9 });
  } else {
    const masked = snapshot2.accountId === null ? null : options.maskAccountId === false ? snapshot2.accountId : maskAccount(snapshot2.accountId, ascii);
    const account = masked === null ? "account unknown" : interpretation.isCurrent ? masked : `last known ${masked}`;
    segments.push({ text: account, priority: 8 });
    segments.push({ text: snapshot2.region ?? "region unknown", priority: 5 });
    if (options.showProfile !== false && snapshot2.profile !== null) {
      segments.push({ text: `profile: ${snapshot2.profile}`, priority: 2 });
    }
    segments.push({ text: snapshot2.environment, priority: 7 });
    segments.push({ text: stateLabel(interpretation), priority: 9 });
  }
  const render = (list) => list.map((segment) => segment.text).join(separator);
  let kept = segments;
  while (render(kept).length > width && kept.length > 1) {
    const lowest = Math.min(...kept.map((segment) => segment.priority));
    const index = kept.findIndex((segment) => segment.priority === lowest);
    kept = kept.filter((_, position) => position !== index);
  }
  const line = render(kept);
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
function interpret(snapshot2, now) {
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (snapshot2 === null) return { state: "not-configured", snapshot: null, isCurrent: false };
  const make = (state) => ({
    state,
    snapshot: snapshot2,
    isCurrent: state === "verified"
  });
  if (snapshot2.verification !== "verified" && snapshot2.diagnosticCode === "NO_CREDENTIALS" && snapshot2.profile === null && snapshot2.accountId === null) {
    return make("not-configured");
  }
  if (snapshot2.verification === "expired") return make("expired");
  if (snapshot2.verification === "error") {
    return make(
      snapshot2.diagnosticCode === "OFFLINE" || snapshot2.diagnosticCode === "TIMEOUT" ? "offline" : "error"
    );
  }
  if (snapshot2.verification === "unverified") return make("unverified");
  const staleAfterMs = snapshot2.staleAfter === null ? Number.NaN : Date.parse(snapshot2.staleAfter);
  const verifiedAtMs = snapshot2.verifiedAt === null ? Number.NaN : Date.parse(snapshot2.verifiedAt);
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
function userConfigPath(env) {
  const root = contextRoot(env);
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

// src/mod/register.ts
var POLL_MS = 5e3;
var snapshot = null;
var preferences = {};
var snapshotStamp = "";
var configStamp = "";
var lastState = "";
var TONE_COLOR = {
  ok: "green",
  alert: "red",
  warn: "yellow",
  danger: "red",
  muted: void 0
};
async function readEnv($) {
  const values = {
    CLAUDE_CONFIG_DIR: await $.env.get("CLAUDE_CONFIG_DIR"),
    USERPROFILE: await $.env.get("USERPROFILE"),
    HOME: await $.env.get("HOME")
  };
  return (name) => values[name];
}
async function readSmall($, path, limit) {
  try {
    const info = await $.fs.stat(path);
    const stamp = `${info.size}:${info.mtimeMs}`;
    if (info.size > limit) return { text: null, stamp };
    return { text: await $.fs.read(path), stamp };
  } catch {
    return { text: null, stamp: "missing" };
  }
}
async function refreshFromDisk($) {
  const env = await readEnv($);
  const root = await $.session.root();
  const configPath = userConfigPath(env);
  if (configPath !== null) {
    const config = await readSmall($, configPath, MAX_CONFIG_BYTES);
    if (config.stamp !== configStamp) {
      configStamp = config.stamp;
      preferences = config.text === null ? {} : parseConfig(config.text, "user").layer;
    }
  }
  const path = snapshotPath(env, await workspaceId(root));
  if (path === null) {
    snapshot = null;
    snapshotStamp = "";
  } else {
    const stored = await readSmall($, path, MAX_SNAPSHOT_BYTES);
    if (`${path}|${stored.stamp}` !== snapshotStamp) {
      snapshotStamp = `${path}|${stored.stamp}`;
      const parsed = stored.text === null ? null : parseSnapshot(stored.text);
      snapshot = parsed?.ok === true ? parsed.snapshot : null;
      lastState = "";
    }
  }
  const state = interpret(snapshot, await $.clock.now()).state;
  if (state !== lastState) {
    lastState = state;
    $.ui.invalidate("ui.render");
  }
}
function describe(interpretation, columns) {
  return formatBar(interpretation, {
    maskAccountId: preferences.maskAccountId ?? true,
    showProfile: preferences.showProfile ?? true,
    width: Math.max(10, columns)
  });
}
function register(on) {
  on("session.start", async ($, e, next) => {
    await refreshFromDisk($).catch(() => void 0);
    $.clock.every(POLL_MS, () => {
      refreshFromDisk($).catch(() => void 0);
    });
    return next(e);
  });
  on(
    "ui.render",
    { component: "AbovePrompt" },
    async ($, e, next) => {
      const rest = await next(e);
      if (e.props.hasSurvey) return rest;
      const { Box, Text } = $.ui.resolve(e);
      const interpretation = interpret(snapshot, await $.clock.now());
      const color = TONE_COLOR[toneOf(interpretation)];
      const line = Text({
        wrap: "truncate-end",
        ...color === void 0 ? { dimColor: true } : { color },
        children: [describe(interpretation, e.props.bodyColumns)]
      });
      return Box({
        flexDirection: "column",
        children: rest === void 0 || rest === null ? [line] : [line, rest]
      });
    }
  );
}
export {
  register
};
