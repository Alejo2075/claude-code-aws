import type { Environment } from "./types.js";

export const MAX_CONFIG_BYTES = 64 * 1024;
export const DEFAULT_TTL_MINUTES = 5;

export type ConfigSource = "user" | "project";
export type EnvironmentClaim = Exclude<Environment, "unknown">;

export interface ConfigLayer {
  source: ConfigSource;
  accounts: Record<string, EnvironmentClaim>;
  ttlMinutes?: number;
  maskAccountId?: boolean;
  showProfile?: boolean;
  showUser?: boolean;
  autoRefresh?: boolean;
}

export interface ParsedConfig {
  layer: ConfigLayer;
  warnings: string[];
}

export interface AccountClassification {
  environment: Environment;
  /** Why this environment was chosen. Shown by `config show`. */
  basis: "user" | "project" | "default";
  /** Set when a project-file claim was ignored because only the user file may mark an account safe. */
  ignoredProjectClaim?: EnvironmentClaim;
}

export interface EffectiveConfig {
  ttlMinutes: number;
  maskAccountId: boolean;
  showProfile: boolean;
  /** Show the user name in the footer and status line. */
  showUser: boolean;
  /** Re-verify in the background when the stored check is old (at most once per time-to-live). */
  autoRefresh: boolean;
  user: ConfigLayer | undefined;
  project: ConfigLayer | undefined;
  warnings: string[];
}

const ACCOUNT_ID = /^\d{12}$/;
const TOP_LEVEL_KEYS = ["version", "ttlMinutes", "autoRefresh", "accounts", "ui"];
const UI_KEYS = ["maskAccountId", "showProfile", "showUser"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses one config file. Repository content is untrusted: it is data only, and bad input is dropped. */
export function parseConfig(text: string, source: ConfigSource): ParsedConfig {
  const layer: ConfigLayer = { source, accounts: {} };
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(`${source} config: ${message}`);
  };
  if (text.length > MAX_CONFIG_BYTES) {
    warn("file is too large and was ignored");
    return { layer, warnings };
  }
  let value: unknown;
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

  // Preferences are personal: a repository file must not lengthen the "verified" window or
  // unmask account ids, so only the user file may set them.
  const personalOnly = source === "project";
  for (const key of ["ttlMinutes", "autoRefresh", "ui"]) {
    if (personalOnly && value[key] !== undefined) {
      warn(`${key} is only honored in the user file; ignored`);
    }
  }

  const ttl = personalOnly ? undefined : value["ttlMinutes"];
  if (ttl !== undefined) {
    if (typeof ttl === "number" && Number.isInteger(ttl) && ttl >= 1 && ttl <= 60) {
      layer.ttlMinutes = ttl;
    } else {
      warn("ttlMinutes must be an integer from 1 to 60; using the default");
    }
  }

  const auto = personalOnly ? undefined : value["autoRefresh"];
  if (typeof auto === "boolean") layer.autoRefresh = auto;
  else if (auto !== undefined) warn("autoRefresh must be a boolean; using the default");

  const accounts = value["accounts"];
  if (accounts !== undefined) {
    if (!isRecord(accounts)) {
      warn("accounts must be an object; ignored");
    } else {
      for (const [id, entry] of Object.entries(accounts)) {
        const environment = isRecord(entry) ? entry["environment"] : undefined;
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

  const ui = personalOnly ? undefined : value["ui"];
  if (ui !== undefined) {
    if (!isRecord(ui)) {
      warn("ui must be an object; ignored");
    } else {
      for (const key of Object.keys(ui)) {
        if (!UI_KEYS.includes(key)) warn("ignored an unknown ui key");
      }
      if (typeof ui["maskAccountId"] === "boolean") layer.maskAccountId = ui["maskAccountId"];
      else if (ui["maskAccountId"] !== undefined) warn("ui.maskAccountId must be a boolean");
      if (typeof ui["showProfile"] === "boolean") layer.showProfile = ui["showProfile"];
      else if (ui["showProfile"] !== undefined) warn("ui.showProfile must be a boolean");
      if (typeof ui["showUser"] === "boolean") layer.showUser = ui["showUser"];
      else if (ui["showUser"] !== undefined) warn("ui.showUser must be a boolean");
    }
  }
  return { layer, warnings };
}

export function mergeConfig(
  user: ParsedConfig | undefined,
  project: ParsedConfig | undefined,
): EffectiveConfig {
  const userLayer = user?.layer;
  const projectLayer = project?.layer;
  return {
    ttlMinutes: userLayer?.ttlMinutes ?? DEFAULT_TTL_MINUTES,
    // Masking defaults to on.
    maskAccountId: userLayer?.maskAccountId ?? true,
    showProfile: userLayer?.showProfile ?? true,
    showUser: userLayer?.showUser ?? true,
    autoRefresh: userLayer?.autoRefresh ?? true,
    user: userLayer,
    project: projectLayer,
    warnings: [...(user?.warnings ?? []), ...(project?.warnings ?? [])],
  };
}

/**
 * Environment of a verified account. `production` if either file says so; `non-production` only
 * when the user's own file says so, because the project file is repository content and must not
 * be able to relabel a production account as safe.
 */
export function classifyAccount(
  config: Pick<EffectiveConfig, "user" | "project">,
  accountId: string | null,
): AccountClassification {
  if (accountId === null) return { environment: "unknown", basis: "default" };
  const userClaim = config.user?.accounts[accountId];
  const projectClaim = config.project?.accounts[accountId];
  if (userClaim === "production") return { environment: "production", basis: "user" };
  if (projectClaim === "production") return { environment: "production", basis: "project" };
  if (userClaim === "non-production") {
    return { environment: "non-production", basis: "user" };
  }
  if (projectClaim === "non-production") {
    return { environment: "unknown", basis: "default", ignoredProjectClaim: projectClaim };
  }
  return { environment: "unknown", basis: "default" };
}
