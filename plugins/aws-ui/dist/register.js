// ../../packages/context-contract/src/bar.ts
var MAX_NAME = 40;
function principalName(arn) {
  if (arn === null) return null;
  const parts = arn.split(":");
  if (parts.length < 6 || parts[0] !== "arn") return null;
  const resource = parts.slice(5).join(":");
  const segments = resource.split("/").filter((segment) => segment !== "");
  const kind = segments[0];
  if (kind === void 0) return null;
  let name;
  if (resource === "root") name = "root";
  else if (kind === "assumed-role") name = segments.length >= 3 ? segments.at(-1) : segments[1];
  else name = segments.length >= 2 ? segments.at(-1) : void 0;
  if (name === void 0) return null;
  const clean = Array.from(name).filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join("");
  if (clean === "") return null;
  return clean.length > MAX_NAME ? `${clean.slice(0, MAX_NAME - 1)}\u2026` : clean;
}
var WARNING = {
  stale: "AWS check stale",
  expired: "AWS session expired",
  offline: "AWS offline",
  unverified: "AWS unverified",
  error: "AWS check failed"
};
var SHORT_USER = 12;
var LABEL_SEPARATOR = " \xB7 ";
var BLOCK_SEPARATOR = " & ";
function footerLabels(interpretation, options = {}) {
  const snapshot2 = interpretation.snapshot;
  if (snapshot2 === null || interpretation.state === "not-configured") {
    return { identity: null, warning: null };
  }
  const warning = WARNING[interpretation.state] ?? null;
  const user = principalName(snapshot2.principalArn);
  const shortUser = user !== null && user.length > SHORT_USER ? `${user.slice(0, SHORT_USER - 1)}\u2026` : user;
  const region = snapshot2.region;
  const environment = snapshot2.environment === "unknown" ? null : snapshot2.environment;
  const budget = options.room === void 0 ? Number.POSITIVE_INFINITY : options.room - (warning === null ? 0 : warning.length + BLOCK_SEPARATOR.length);
  const candidates = [
    [user, region, environment],
    [user, environment],
    [shortUser, region, environment],
    [shortUser, environment],
    [environment],
    [shortUser],
    [region]
  ].map((parts) => parts.filter((part) => part !== null)).filter((parts) => parts.length > 0).map((parts) => parts.join(LABEL_SEPARATOR));
  const identity = candidates.find((candidate) => candidate.length <= budget) ?? null;
  return { identity, warning };
}

// ../../packages/context-contract/src/config.ts
var MAX_CONFIG_BYTES = 64 * 1024;

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
var FOOTER_PADDING = 4;
var FOOTER_GAP = 2;
var MODE_LABEL = 20;
var RESERVE = 16;
var MAX_WIDTH = 64;
var GAP = "\xA0\xA0\xA0";
var MODE_SEPARATOR = " & ";
var hintWidth = 0;
var snapshot = null;
var snapshotStamp = "";
var lastState = "";
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
  const path = snapshotPath(env, await workspaceId(await $.session.root()));
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
function roomFor(e) {
  const columns = e.viewport?.columns;
  if (e.surface !== "terminal" || columns === void 0) return MAX_WIDTH;
  const others = e.props.modes.join(MODE_SEPARATOR).length;
  const taken = FOOTER_PADDING + FOOTER_GAP + MODE_LABEL + (hintWidth > 0 ? 1 + hintWidth : 0) + (others > 0 ? others + MODE_SEPARATOR.length : 0) + GAP.length + RESERVE;
  return Math.max(0, Math.min(MAX_WIDTH, columns - taken));
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
    { component: "SessionMode" },
    async ($, e, next) => {
      const { identity, warning } = footerLabels(interpret(snapshot, await $.clock.now()), {
        room: roomFor(e)
      });
      const added = [identity, warning].filter((label) => label !== null);
      if (added.length === 0) return next(e);
      added[0] = `${GAP}${added[0] ?? ""}`;
      return next({ ...e, props: { ...e.props, modes: [...e.props.modes, ...added] } });
    }
  );
  on(
    "ui.render",
    { component: "PromptHint" },
    ($, e, next) => {
      if (e.surface === "terminal" && e.props.hint.length !== hintWidth) {
        hintWidth = e.props.hint.length;
        $.ui.invalidate("ui.render");
      }
      return next(e);
    }
  );
}
export {
  register
};
