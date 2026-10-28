import { readFileSync, statSync } from "node:fs";

import {
  type ConfigSource,
  type EffectiveConfig,
  type EnvReader,
  MAX_CONFIG_BYTES,
  mergeConfig,
  type ParsedConfig,
  parseConfig,
  projectConfigPath,
  userConfigPath,
} from "@claude-code-aws/context-contract";

function readLayer(path: string | null, source: ConfigSource): ParsedConfig | undefined {
  if (path === null) return undefined;
  let text: string;
  try {
    if (statSync(path).size > MAX_CONFIG_BYTES) {
      return parseConfig(" ".repeat(MAX_CONFIG_BYTES + 1), source);
    }
    text = readFileSync(path, "utf8");
  } catch {
    // No file is the normal case, not a warning.
    return undefined;
  }
  return parseConfig(text, source);
}

/** Loads the user and project configuration files. Never throws; bad files become warnings. */
export function loadConfig(env: EnvReader, projectDir: string): EffectiveConfig {
  return mergeConfig(
    readLayer(userConfigPath(env), "user"),
    readLayer(projectConfigPath(projectDir), "project"),
  );
}
