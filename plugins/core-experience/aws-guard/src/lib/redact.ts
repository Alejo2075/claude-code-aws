// Reasons are shown to the user and to Claude, and a command can contain credentials. Anything
// that looks like one is replaced before text leaves this plugin.
const SENSITIVE_NAME =
  /(SECRET|TOKEN|PASSWORD|PASSWD|ACCESS_KEY|SESSION|CREDENTIAL|PRIVATE_KEY|API_KEY)/i;
const SENSITIVE_FLAG =
  /^--?(password|passwd|secret|secret-string|secret-access-key|session-token|token|api-key|private-key|auth-token)$/i;
const KEY_ID = /\b(AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g;
const SECRET_LIKE = /\b[A-Za-z0-9/+]{40}\b/g;
export const MAX_REASON_COMMAND = 160;

export function redact(text: string): string {
  const words = text.split(/(\s+)/);
  let previousFlag = false;
  const out = words.map((piece) => {
    if (/^\s+$/.test(piece) || piece === "") return piece;
    if (previousFlag) {
      previousFlag = false;
      return "[redacted]";
    }
    const eq = piece.indexOf("=");
    if (eq > 0 && SENSITIVE_NAME.test(piece.slice(0, eq)))
      return `${piece.slice(0, eq)}=[redacted]`;
    if (SENSITIVE_FLAG.test(piece)) {
      previousFlag = true;
      return piece;
    }
    const flagEq = piece.match(/^(--?[A-Za-z-]+)=/);
    if (flagEq !== null && SENSITIVE_FLAG.test(flagEq[1] ?? "")) return `${flagEq[1]}=[redacted]`;
    return piece;
  });
  return out
    .join("")
    .replace(KEY_ID, "[redacted]")
    .replace(SECRET_LIKE, (match) =>
      /\d/.test(match) && /[A-Z]/.test(match) && /[a-z]/.test(match) ? "[redacted]" : match,
    );
}

/** A command shortened for a message, with secrets removed first. */
export function shorten(text: string, max = MAX_REASON_COMMAND): string {
  const clean = redact(text.replace(/\s+/g, " ").trim());
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
