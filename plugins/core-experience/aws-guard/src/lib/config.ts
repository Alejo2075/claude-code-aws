// Configuration for the guard, in two layers with different trust. The user file is the user's own
// and may tune everything. The project file is repository content: it may only add `deny` and
// `ask` rules (more friction), never lower the guard. Every rule only adds friction by design:
// there is no `allow` rule.
import type { OpClass } from "./types.js";

export const MAX_CONFIG_BYTES = 64 * 1024;
const MAX_RULES = 100;
const MAX_PATTERN = 200;

export type RuleAction = "deny" | "ask";
export type RuleEnvironment = "production" | "non-production" | "unknown";

export interface Rule {
  action: RuleAction;
  class?: OpClass | "any";
  environment?: RuleEnvironment;
  tool?: string;
  /** Glob (`*` only) matched against `<tool> <arguments>`. */
  command?: string;
}

export type ConfigSource = "user" | "project";
export type OnUnverified = "ask" | "deny" | "ignore";

export interface GuardConfig {
  rules: Rule[];
  /** What `ask` becomes in modes where nobody can answer a prompt. */
  unattended: "deny" | "ask";
  /** What to do for a change whose target account cannot be verified. */
  onUnverified: OnUnverified;
  /** Extra MCP server names to treat as AWS servers. */
  mcpServers: string[];
  warnings: string[];
}

export const DEFAULT_CONFIG: GuardConfig = {
  rules: [],
  unattended: "deny",
  onUnverified: "ask",
  mcpServers: [],
  warnings: [],
};

const CLASSES = new Set(["read", "local", "write", "delete", "destructive", "unknown", "any"]);
const ENVIRONMENTS = new Set(["production", "non-production", "unknown"]);
const RULE_KEYS = new Set(["class", "environment", "tool", "command"]);
const TOP_KEYS = new Set(["version", "deny", "ask", "unattended", "onUnverified", "mcpServers"]);

interface Layer {
  rules: Rule[];
  unattended?: "deny" | "ask";
  onUnverified?: OnUnverified;
  mcpServers: string[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRules(list: unknown, action: RuleAction, warn: (m: string) => void): Rule[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) {
    warn(`${action} must be a list; ignored`);
    return [];
  }
  const rules: Rule[] = [];
  for (const entry of list.slice(0, MAX_RULES)) {
    if (!isRecord(entry)) {
      warn(`a ${action} rule is not an object; ignored`);
      continue;
    }
    const rule: Rule = { action };
    let valid = Object.keys(entry).length > 0;
    for (const [key, value] of Object.entries(entry)) {
      if (!RULE_KEYS.has(key)) {
        warn(`a ${action} rule has an unknown key; the rule was ignored`);
        valid = false;
      } else if (typeof value !== "string" || value === "" || value.length > MAX_PATTERN) {
        warn(`a ${action} rule has an invalid ${key}; the rule was ignored`);
        valid = false;
      } else if (key === "class" && CLASSES.has(value)) rule.class = value as OpClass | "any";
      else if (key === "environment" && ENVIRONMENTS.has(value))
        rule.environment = value as RuleEnvironment;
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

export function parseGuardConfig(text: string, source: ConfigSource): Layer {
  const layer: Layer = { rules: [], mcpServers: [], warnings: [] };
  const warn = (message: string): void => {
    layer.warnings.push(`${source} config: ${message}`);
  };
  if (text.length > MAX_CONFIG_BYTES) {
    warn("file is too large and was ignored");
    return layer;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    warn("is not valid JSON and was ignored");
    return layer;
  }
  if (!isRecord(value) || value["version"] !== 1) {
    warn("must be a JSON object with version 1; the file was ignored");
    return layer;
  }
  for (const key of Object.keys(value)) {
    if (!TOP_KEYS.has(key)) warn("ignored an unknown top-level key");
  }
  layer.rules = [
    ...parseRules(value["deny"], "deny", warn),
    ...parseRules(value["ask"], "ask", warn),
  ];

  const personalOnly = source === "project";
  for (const key of ["unattended", "onUnverified", "mcpServers"]) {
    if (personalOnly && value[key] !== undefined) {
      warn(`${key} is only honored in the user file; ignored`);
    }
  }
  if (personalOnly) return layer;

  const unattended = value["unattended"];
  if (unattended === "deny" || unattended === "ask") layer.unattended = unattended;
  else if (unattended !== undefined) warn('unattended must be "deny" or "ask"; using the default');
  const onUnverified = value["onUnverified"];
  if (onUnverified === "ask" || onUnverified === "deny" || onUnverified === "ignore") {
    layer.onUnverified = onUnverified;
  } else if (onUnverified !== undefined) {
    warn('onUnverified must be "ask", "deny", or "ignore"; using the default');
  }
  const servers = value["mcpServers"];
  if (servers !== undefined) {
    if (!isRecord(servers)) warn("mcpServers must be an object; ignored");
    else {
      for (const [name, kind] of Object.entries(servers)) {
        if (kind === "aws" && name.length <= 128) layer.mcpServers.push(name);
        else warn('an mcpServers entry must map a server name to "aws"; ignored');
      }
    }
  }
  return layer;
}

export function mergeGuardConfig(user: Layer | undefined, project: Layer | undefined): GuardConfig {
  return {
    rules: [...(user?.rules ?? []), ...(project?.rules ?? [])],
    unattended: user?.unattended ?? DEFAULT_CONFIG.unattended,
    onUnverified: user?.onUnverified ?? DEFAULT_CONFIG.onUnverified,
    mcpServers: user?.mcpServers ?? [],
    warnings: [...(user?.warnings ?? []), ...(project?.warnings ?? [])],
  };
}
