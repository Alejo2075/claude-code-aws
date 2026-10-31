// Everything read from AWS is untrusted data and may hold secrets. Before anything is printed or
// kept, secret-looking values are replaced, terminal control characters are removed, and sizes are
// bounded. Redaction can hide a useful value; the report says how many it replaced.
export const REDACTED = "[redacted]";

const MAX_DEPTH = 20;
const MAX_NODES = 20_000;
const MAX_STRING = 2000;
const MAX_ARRAY = 200;

/** Property names whose values are secrets. Matched on the name, ignoring case and separators. */
const SECRET_NAME =
  /(password|passwd|passphrase|secret|token|privatekey|credential|connectionstring|apikey|authkey|accesskey|signingkey|masteruserpassword|encryptionkey|clientsecret|bearer)/i;
/** Names that look secret but hold only a reference or a setting, not the value. */
const NOT_SECRET_NAME =
  /(secretarn|secretname|secretid|secretsmanager|kmskey|tokenvalidity|tokenendpoint|credentialarn|credentialsarn|secrets$|passwordpolicy|requirepassword|allowuserstochangepassword|hardexpiry|passwordreuse|maxpasswordage|minimumpassword|passwordlength|requiremfa|accesskeyid$)/i;

const CREDENTIAL_VALUE: RegExp[] = [
  /\b(AKIA|ASIA|AGPA|AIDA|AROA|ANPA)[0-9A-Z]{16}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

function normalized(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, "");
}

export function isSecretName(name: string): boolean {
  const clean = normalized(name);
  return SECRET_NAME.test(clean) && !NOT_SECRET_NAME.test(clean);
}

const ESC = 0x1b;
const BEL = 0x07;

/** Characters that take no part in text: controls, and bidirectional overrides that reorder it. */
function isInvisible(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/**
 * Removes terminal escape sequences (CSI and OSC) and control characters that could redraw or
 * inject into a terminal. A single linear pass, with no regular expression to attack.
 */
export function sanitizeText(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code === ESC) {
      const kind = value.charAt(i + 1);
      if (kind === "[") {
        // CSI: parameters, then a final byte in @..~
        i += 2;
        while (i < value.length && !(value.charCodeAt(i) >= 0x40 && value.charCodeAt(i) <= 0x7e))
          i += 1;
      } else if (kind === "]") {
        // OSC: until BEL or ESC \
        i += 2;
        while (i < value.length && value.charCodeAt(i) !== BEL && value.charCodeAt(i) !== ESC)
          i += 1;
        if (value.charCodeAt(i) === ESC) i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (!isInvisible(code)) out += value.charAt(i);
  }
  return out;
}

export interface Redactor {
  /** Redacts any JSON-like value. */
  value(input: unknown, parentName?: string): unknown;
  /** Redacts one string that is known to belong to a named field. */
  field(name: string, input: string): string;
  /** How many values were replaced so far. */
  count(): number;
  /** Whether bounds cut anything (depth, size, length). */
  cut(): boolean;
}

export function createRedactor(): Redactor {
  let redacted = 0;
  let nodes = 0;
  let cut = false;

  const replace = (): string => {
    redacted += 1;
    return REDACTED;
  };

  const text = (input: string): string => {
    const clean = sanitizeText(input);
    if (CREDENTIAL_VALUE.some((pattern) => pattern.test(clean))) return replace();
    if (clean.length > MAX_STRING) {
      cut = true;
      return `${clean.slice(0, MAX_STRING)}…[${clean.length - MAX_STRING} more characters]`;
    }
    return clean;
  };

  const walk = (input: unknown, name: string, depth: number): unknown => {
    nodes += 1;
    if (nodes > MAX_NODES || depth > MAX_DEPTH) {
      cut = true;
      return "[truncated]";
    }
    if (typeof input === "string") return isSecretName(name) ? replace() : text(input);
    if (typeof input === "number" || typeof input === "boolean" || input === null) return input;
    if (Array.isArray(input)) {
      if (input.length > MAX_ARRAY) cut = true;
      const items = input.slice(0, MAX_ARRAY);
      // A list of { Name, Value } or { Key, Value } entries: the name decides if the value is secret,
      // and environment-variable lists never show their values.
      const environment = /^(environment|environmentvariables)$/i.test(name);
      return items.map((item) => {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const record = item as Record<string, unknown>;
          const label = [
            record["Key"],
            record["Name"],
            record["ParameterKey"],
            record["OutputKey"],
          ].find((candidate): candidate is string => typeof candidate === "string");
          if (label !== undefined) {
            const copy: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(record)) {
              const isValue = /^(Value|ParameterValue|OutputValue)$/.test(key);
              copy[key] =
                isValue && typeof value === "string" && (environment || isSecretName(label))
                  ? replace()
                  : walk(value, key, depth + 1);
            }
            return copy;
          }
        }
        return walk(item, name, depth + 1);
      });
    }
    if (typeof input === "object") {
      const out: Record<string, unknown> = {};
      const environmentMap = /^(variables)$/i.test(name) ? true : false;
      for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
        if (environmentMap && typeof value === "string") out[sanitizeText(key)] = replace();
        else if (isSecretName(key) && (typeof value === "string" || typeof value === "number")) {
          out[sanitizeText(key)] = replace();
        } else out[sanitizeText(key)] = walk(value, key, depth + 1);
      }
      return out;
    }
    return "[unsupported]";
  };

  return {
    value: (input, parentName = "") => walk(input, parentName, 0),
    field: (name, input) => (isSecretName(name) ? replace() : text(input)),
    count: () => redacted,
    cut: () => cut,
  };
}
