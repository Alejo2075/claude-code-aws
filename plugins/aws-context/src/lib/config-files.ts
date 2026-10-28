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
import { readTextBounded } from "@claude-code-aws/context-contract/node";

function readLayer(path: string | null, source: ConfigSource): ParsedConfig | undefined {
  if (path === null) return undefined;
  const read = readTextBounded(path, MAX_CONFIG_BYTES);
  // No file is the normal case, not a warning. An unreadable or oversized one is reported.
  if (read.kind === "missing") return undefined;
  if (read.kind === "ok") return parseConfig(read.text, source);
  return parseConfig(" ".repeat(MAX_CONFIG_BYTES + 1), source);
}

/** Loads the user and project configuration files. Never throws; bad files become warnings. */
export function loadConfig(env: EnvReader, projectDir: string): EffectiveConfig {
  return mergeConfig(
    readLayer(userConfigPath(env), "user"),
    readLayer(projectConfigPath(projectDir), "project"),
  );
}
