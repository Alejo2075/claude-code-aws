/**
 * Locations are computed from environment variables alone, so a mod (which has no Node APIs) and a
 * Node CLI derive the same path. Separators are always "/", which Node accepts on Windows too.
 */
export type EnvReader = (name: string) => string | undefined;

const SNAPSHOT_VERSION_DIR = "v1";

function stripTrailingSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function nonEmpty(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

/** `$CLAUDE_CONFIG_DIR`, else `<home>/.claude`. USERPROFILE wins because only Windows sets it. */
export function claudeConfigDir(env: EnvReader): string | null {
  const explicit = nonEmpty(env("CLAUDE_CONFIG_DIR"));
  if (explicit) return stripTrailingSeparators(explicit);
  const home = nonEmpty(env("USERPROFILE")) ?? nonEmpty(env("HOME"));
  return home ? `${stripTrailingSeparators(home)}/.claude` : null;
}

export function contextRoot(env: EnvReader): string | null {
  const base = claudeConfigDir(env);
  return base ? `${base}/aws-context` : null;
}

export function snapshotDir(env: EnvReader): string | null {
  const root = contextRoot(env);
  return root ? `${root}/${SNAPSHOT_VERSION_DIR}` : null;
}

export function snapshotPath(env: EnvReader, workspaceId: string): string | null {
  const dir = snapshotDir(env);
  return dir ? `${dir}/${workspaceId}.json` : null;
}

export function userConfigPath(env: EnvReader): string | null {
  const root = contextRoot(env);
  return root ? `${root}/config.json` : null;
}

export function projectConfigPath(projectDir: string): string {
  return `${stripTrailingSeparators(projectDir)}/.aws-context.json`;
}
