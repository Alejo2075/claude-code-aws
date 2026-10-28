const WINDOWS_PATH = /^(?:[A-Za-z]:[\\/]|\\\\)/;

/**
 * Canonical string for a workspace directory. No realpath: a mod cannot call it, so both sides
 * hash the directory exactly as Claude Code reports it, normalized only for separators, trailing
 * separators, and (for Windows paths) case.
 */
export function normalizeWorkspacePath(path: string): string {
  if (WINDOWS_PATH.test(path)) {
    return path.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  }
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** First 16 hex characters of SHA-256 over the normalized path. */
export async function workspaceId(path: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeWorkspacePath(path));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest).subarray(0, 8), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
