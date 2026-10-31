// Free text (log lines, command output, error messages) needs the same care as structured data:
// secrets and personal data are replaced, control characters removed, and length bounded.
import { REDACTED, sanitizeText } from "./redact.js";

const CREDENTIAL_VALUE: RegExp[] = [
  /\b(AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
];
/** `name=value`, `name: value`, or `"name":"value"` where the name says it is a secret. */
const SECRET_PAIR =
  /\b([A-Za-z0-9_.-]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|authorization|credential|private[_-]?key|session[_-]?token)[A-Za-z0-9_.-]*)(["']?\s*[:=]\s*["']?)(?!\[redacted\])([^\s"',;}&]{3,})/gi;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export interface TextRedaction {
  text: string;
  /** How many values were replaced. */
  redacted: number;
}

export interface TextOptions {
  /** Also replace email addresses and card-like numbers. Default true. */
  personalData?: boolean;
}

/** Redacts credentials (and, by default, personal data) in free text. */
export function redactText(input: string, options: TextOptions = {}): TextRedaction {
  let redacted = 0;
  let text = sanitizeText(input, true);
  const replace = (): string => {
    redacted += 1;
    return REDACTED;
  };
  for (const pattern of CREDENTIAL_VALUE) text = text.replace(pattern, replace);
  text = text.replace(BEARER, (_match, scheme: string) => `${scheme} ${replace()}`);
  text = text.replace(
    SECRET_PAIR,
    (_match, name: string, separator: string) => `${name}${separator}${replace()}`,
  );
  if (options.personalData !== false) {
    text = text.replace(EMAIL, replace);
    text = text.replace(CARD, (match) => {
      const digits = match.replace(/[^0-9]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhn(digits) ? replace() : match;
    });
  }
  return { text, redacted };
}

export interface Bounded {
  text: string;
  /** Lines or characters were left out. */
  cut: boolean;
  omittedLines: number;
}

/** Keeps at most `maxLines` lines of at most `maxLineLength` characters, and `maxChars` in total. */
export function boundText(
  input: string,
  limits: { maxLines: number; maxLineLength?: number; maxChars?: number },
): Bounded {
  const maxLineLength = limits.maxLineLength ?? 500;
  const maxChars = limits.maxChars ?? 20_000;
  const lines = input.split(/\r?\n/);
  const kept: string[] = [];
  let total = 0;
  let cut = false;
  for (const line of lines) {
    if (kept.length >= limits.maxLines || total >= maxChars) {
      cut = true;
      break;
    }
    const clipped =
      line.length > maxLineLength
        ? `${line.slice(0, maxLineLength)}…[+${line.length - maxLineLength}]`
        : line;
    if (clipped.length !== line.length) cut = true;
    kept.push(clipped);
    total += clipped.length + 1;
  }
  return { text: kept.join("\n"), cut, omittedLines: Math.max(0, lines.length - kept.length) };
}

/** Redact, then bound: the order matters, so a secret cut in half is never left behind. */
export function safeText(
  input: string,
  limits: { maxLines: number; maxLineLength?: number; maxChars?: number },
  options: TextOptions = {},
): Bounded & { redacted: number } {
  const clean = redactText(input, options);
  return { ...boundText(clean.text, limits), redacted: clean.redacted };
}
