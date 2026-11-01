// ../../../packages/context-contract/src/text.ts
function trimTrailingSeparators(path, separators = "/") {
  let end = path.length;
  while (end > 0 && separators.includes(path.charAt(end - 1))) end -= 1;
  return path.slice(0, end);
}
var WIDE_RANGES = [
  [4352, 4447],
  [11904, 12350],
  [12353, 42191],
  [44032, 55203],
  [63744, 64255],
  [65072, 65135],
  [65280, 65376],
  [65504, 65510],
  [127744, 128591],
  [129280, 129535],
  [131072, 262141]
];
function cellsOf(codePoint) {
  if (codePoint < 32 || codePoint >= 127 && codePoint < 160) return 0;
  if (codePoint >= 768 && codePoint <= 879) return 0;
  if (codePoint >= 8203 && codePoint <= 8207) return 0;
  if (codePoint >= 65024 && codePoint <= 65039) return 0;
  return WIDE_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to) ? 2 : 1;
}
function cellWidth(text) {
  let width = 0;
  for (const char of text) width += cellsOf(char.codePointAt(0) ?? 0);
  return width;
}
function clipCodePoints(text, count) {
  return Array.from(text).slice(0, Math.max(0, count)).join("");
}

// ../../../packages/context-contract/src/bar.ts
function maskAccount(accountId, ascii = false) {
  return `${accountId.slice(0, 4)}${ascii ? "..." : "\u2026"}${accountId.slice(-4)}`;
}
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
  const chars = Array.from(clean);
  return chars.length > MAX_NAME ? `${chars.slice(0, MAX_NAME - 1).join("")}\u2026` : clean;
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
  const user = options.showUser === false ? null : principalName(snapshot2.principalArn);
  const shortUser = user !== null && Array.from(user).length > SHORT_USER ? `${clipCodePoints(user, SHORT_USER - 1)}\u2026` : user;
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
  const identity = candidates.find((candidate) => cellWidth(candidate) <= budget) ?? null;
  return { identity, warning };
}

// ../../../packages/context-contract/src/config.ts
var MAX_CONFIG_BYTES = 64 * 1024;
var ACCOUNT_ID = /^\d{12}$/;
var TOP_LEVEL_KEYS = ["version", "ttlMinutes", "autoRefresh", "accounts", "ui"];
var UI_KEYS = ["maskAccountId", "showProfile", "showUser"];
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
  for (const key of ["ttlMinutes", "autoRefresh", "ui"]) {
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
  const auto = personalOnly ? void 0 : value["autoRefresh"];
  if (typeof auto === "boolean") layer.autoRefresh = auto;
  else if (auto !== void 0) warn("autoRefresh must be a boolean; using the default");
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
      if (typeof ui["showUser"] === "boolean") layer.showUser = ui["showUser"];
      else if (ui["showUser"] !== void 0) warn("ui.showUser must be a boolean");
    }
  }
  return { layer, warnings };
}

// ../../../packages/context-contract/src/interpret.ts
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
function userConfigPath(env) {
  const root = contextRoot(env);
  return root ? `${root}/config.json` : null;
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

// ../../../packages/safe-output/src/redact.ts
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

// src/lib/panel.ts
var MAX_FILE_BYTES = 1e6;
var isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
var str = (v, max = 300) => sanitizeText(typeof v === "string" || typeof v === "number" ? String(v) : "").slice(0, max);
var SEVERITY = {
  critical: "red",
  high: "red",
  medium: "yellow",
  low: "plain",
  info: "dim"
};
var STATUS_TONE = {
  gap: "red",
  partial: "yellow",
  unknown: "dim",
  evidenced: "green"
};
function reportLines(doc) {
  const lines = [];
  const ctx = isObj(doc["context"]) ? doc["context"] : {};
  const account = typeof ctx["accountId"] === "string" ? maskAccount(ctx["accountId"]) : "no AWS account involved";
  lines.push({
    text: `${str(doc["plugin"], 40)} \xB7 ${str(doc["mode"], 20)} \xB7 ${account}${ctx["identityVerified"] === true ? " \xB7 identity verified" : ""}`,
    tone: "dim"
  });
  lines.push({ text: str(doc["summary"], 400), tone: "bold" });
  const findings = Array.isArray(doc["findings"]) ? doc["findings"].filter(isObj) : [];
  for (const f of findings.slice(0, 200)) {
    const sev = str(f["severity"], 10);
    lines.push({
      text: `[${sev.toUpperCase()}] ${str(f["title"], 200)}${f["status"] === "hypothesis" ? " (hypothesis)" : ""}`,
      tone: SEVERITY[sev] ?? "plain"
    });
    const resource = Array.isArray(f["affectedResources"]) && typeof f["affectedResources"][0] === "string" ? str(f["affectedResources"][0], 120) : "";
    if (resource !== "")
      lines.push({ text: `   ${resource}  ${str(f["ruleId"], 60)}`, tone: "dim" });
  }
  if (findings.length === 0) lines.push({ text: "No findings.", tone: "dim" });
  for (const l of (Array.isArray(doc["limitations"]) ? doc["limitations"] : []).slice(0, 6))
    lines.push({ text: `- ${str(l, 300)}`, tone: "dim" });
  return { title: `Report: ${str(doc["plugin"], 30) || "analysis"}`, lines };
}
function reviewLines(doc) {
  const lines = [{ text: str(doc["disclaimer"], 400), tone: "dim" }];
  const scope = isObj(doc["scope"]) ? doc["scope"] : {};
  lines.push({
    text: `${str(scope["name"], 80)} \xB7 ${str(scope["criticality"], 20)} \xB7 ${str(scope["environment"], 40)}`,
    tone: "bold"
  });
  const cov = isObj(doc["coverage"]) ? doc["coverage"] : {};
  lines.push({
    text: `Evidence for ${str(cov["withEvidence"], 5)} of ${str(cov["questions"], 5)} questions; ${str(cov["verified"], 5)} verified from the account`,
    tone: "plain"
  });
  const pillars = isObj(doc["byPillar"]) ? doc["byPillar"] : {};
  for (const [name, counts] of Object.entries(pillars).slice(0, 8)) {
    if (!isObj(counts)) continue;
    lines.push({
      text: `${name.padEnd(24)} evidenced ${str(counts["evidenced"], 3)}  partly ${str(counts["partial"], 3)}  gap ${str(counts["gap"], 3)}  no evidence ${str(counts["unknown"], 3)}`,
      tone: "plain"
    });
  }
  const backlog = Array.isArray(doc["backlog"]) ? doc["backlog"].filter(isObj) : [];
  if (backlog.length > 0) lines.push({ text: "Backlog", tone: "bold" });
  for (const b of backlog.slice(0, 50))
    lines.push({
      text: `${str(b["priority"], 3)} ${str(b["questionId"], 40)} (${str(b["status"], 10)}): ${str(b["action"], 200)}`,
      tone: STATUS_TONE[str(b["status"], 10)] ?? "plain"
    });
  const missing = Array.isArray(doc["missing"]) ? doc["missing"].length : 0;
  if (missing > 0)
    lines.push({ text: `${missing} question(s) have no evidence: unknown, not met`, tone: "dim" });
  return { title: "Well-Architected style review", lines };
}
function diagramLines(doc) {
  const lines = [
    { text: `${str(doc["title"], 80)} (${str(doc["diagramType"], 30)})`, tone: "bold" },
    { text: str(doc["legend"], 400), tone: "dim" }
  ];
  for (const l of str(doc["mermaid"], 2e4).split("\n").slice(0, 200))
    lines.push({ text: l, tone: "plain" });
  for (const p of (Array.isArray(doc["provenance"]) ? doc["provenance"] : []).slice(0, 5))
    lines.push({ text: `Source: ${str(p, 200)}`, tone: "dim" });
  return { title: "Diagram (Mermaid source)", lines };
}
function panelFor(text) {
  if (text === null)
    return {
      title: "Report",
      lines: [{ text: "The file could not be read, or is larger than 1 MB.", tone: "red" }]
    };
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return { title: "Report", lines: [{ text: "The file is not valid JSON.", tone: "red" }] };
  }
  if (isObj(doc) && doc["kind"] === "WellArchitectedReview") return reviewLines(doc);
  if (isObj(doc) && doc["kind"] === "DiagramArtifact") return diagramLines(doc);
  if (isObj(doc) && doc["schemaVersion"] === "1" && Array.isArray(doc["findings"]) && typeof doc["plugin"] === "string")
    return reportLines(doc);
  return {
    title: "Report",
    lines: [
      {
        text: "This is not a report this panel understands (an analysis report, a Well-Architected review, or a diagram artifact, as JSON).",
        tone: "yellow"
      }
    ]
  };
}
function fit(lines, columns, rows) {
  const width = Math.max(20, columns);
  const room = Math.max(3, rows - 2);
  const cut = lines.map(
    (l) => l.text.length > width ? { ...l, text: `${l.text.slice(0, width - 1)}\u2026` } : l
  );
  if (cut.length <= room) return cut;
  return [
    ...cut.slice(0, room - 1),
    {
      text: `\u2026 ${cut.length - room + 1} more line(s); use --json in the plugin command for all`,
      tone: "dim"
    }
  ];
}

// src/mod/panel.ts
var shown = null;
var TEXT_PROPS = {
  plain: {},
  dim: { dimColor: true },
  bold: { bold: true },
  red: { color: "red" },
  yellow: { color: "yellow" },
  green: { color: "green" }
};
async function load($, path) {
  try {
    const info = await $.fs.stat(path);
    if (info.size > MAX_FILE_BYTES) return null;
    return await $.fs.read(path);
  } catch {
    return null;
  }
}
async function registerReportCommand($) {
  await $.command.register({
    name: "aws-report",
    description: "Show an AWS plugin report (JSON) in a pane: /aws-report <file>"
  });
}
function registerPanel(on) {
  on("command.run", { command: "aws-report" }, async ($, e) => {
    const path = e.args.trim();
    if (path === "")
      return {
        text: "Usage: /aws-report <path to a JSON report>. Write one with a plugin command and --json, for example /aws-security:audit --json."
      };
    shown = panelFor(await load($, path));
    await $.ui.open({ id: "aws-report", title: shown.title });
    $.ui.invalidate("ui.render");
    return { text: `${shown.title} opened. The file was only read; nothing was changed.` };
  });
  on("ui.render", { component: "Pane", requestId: "aws-report" }, ($, e) => {
    const { Box, Text } = $.ui.resolve(e);
    const panel = shown ?? {
      title: "Report",
      lines: [{ text: "Nothing to show yet: /aws-report <file>", tone: "dim" }]
    };
    const lines = fit(
      panel.lines,
      e.props?.bodyColumns ?? e.viewport?.columns ?? 80,
      e.viewport?.rows ?? 24
    );
    return h(
      Box,
      { flexDirection: "column" },
      ...lines.map((l) => h(Text, TEXT_PROPS[l.tone], l.text))
    );
  });
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
var showUser = true;
var configStamp = "";
var lastShape = "";
var poller = null;
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
  await refreshPreferences($, env);
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
      lastShape = "";
    }
  }
  const shape = `${interpret(snapshot, await $.clock.now()).state}|${showUser}`;
  if (shape !== lastShape) {
    lastShape = shape;
    $.ui.invalidate("ui.render");
  }
}
async function refreshPreferences($, env) {
  const path = userConfigPath(env);
  if (path === null) return;
  const stored = await readSmall($, path, MAX_CONFIG_BYTES);
  if (`${path}|${stored.stamp}` === configStamp) return;
  configStamp = `${path}|${stored.stamp}`;
  const parsed = stored.text === null ? null : parseConfig(stored.text, "user");
  showUser = parsed?.layer.showUser ?? true;
  lastShape = "";
}
function roomFor(e) {
  const columns = e.viewport?.columns;
  if (e.surface !== "terminal" || columns === void 0) return MAX_WIDTH;
  const others = cellWidth(e.props.modes.join(MODE_SEPARATOR));
  const taken = FOOTER_PADDING + FOOTER_GAP + MODE_LABEL + (hintWidth > 0 ? 1 + hintWidth : 0) + (others > 0 ? others + MODE_SEPARATOR.length : 0) + cellWidth(GAP) + RESERVE;
  return Math.max(0, Math.min(MAX_WIDTH, columns - taken));
}
function register(on) {
  registerPanel(on);
  on("session.start", async ($, e, next) => {
    await registerReportCommand($).catch(() => void 0);
    await refreshFromDisk($).catch(() => void 0);
    poller?.cancel();
    poller = $.clock.every(POLL_MS, () => {
      refreshFromDisk($).catch(() => void 0);
    });
    return next(e);
  });
  on(
    "ui.render",
    { component: "SessionMode" },
    async ($, e, next) => {
      const { identity, warning } = footerLabels(interpret(snapshot, await $.clock.now()), {
        room: roomFor(e),
        showUser
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
      const width = cellWidth(e.props.hint);
      if (e.surface === "terminal" && width !== hintWidth) {
        hintWidth = width;
        $.ui.invalidate("ui.render");
      }
      return next(e);
    }
  );
}
export {
  register
};
