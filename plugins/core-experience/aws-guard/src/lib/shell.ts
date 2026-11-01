// A small, shell-aware command splitter. It is not a full shell: it understands quoting, escapes,
// separators, pipes, redirections, here-documents, and command substitutions well enough to find
// the simple commands a Bash tool call would run. Anything it cannot see through is flagged
// rather than guessed at. It is linear in the input and bounded in depth, because the input is
// model- or repository-controlled.

export interface Word {
  text: string;
  /** Contains an expansion (`$VAR`, `$(...)`, backticks) whose value is not known here. */
  dynamic: boolean;
}

export interface SimpleCommand {
  words: Word[];
  /** Leading `NAME=value` assignments, and `export NAME=value` that came earlier in the command. */
  env: Record<string, string>;
  /** Its standard input comes from a pipe. */
  piped: boolean;
  /** Text fed to it by a here-document or here-string. */
  stdinText: string | null;
}

export interface ParseResult {
  commands: SimpleCommand[];
  /** The input was too large or too deeply nested to analyze completely. */
  truncated: boolean;
}

export const MAX_SOURCE = 20_000;
const MAX_DEPTH = 6;
const MAX_COMMANDS = 400;
const KEYWORDS = new Set([
  "if",
  "then",
  "else",
  "elif",
  "do",
  "while",
  "until",
  "!",
  "{",
  "time",
  "}",
  "fi",
  "done",
  "esac",
]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SPECIAL_PARAMETERS = new Set(["@", "*", "?", "!", "#", "-", "$"]);

interface State {
  commands: SimpleCommand[];
  truncated: boolean;
  /** Exports seen earlier in the same command line, carried to later commands. */
  exported: Record<string, string>;
}

/** Index of the `)` that closes the `(` before `from`, skipping quotes and nesting. -1 if none. */
function findClosingParen(src: string, from: number): number {
  let depth = 1;
  for (let i = from; i < src.length; i += 1) {
    const c = src[i];
    if (c === "\\") i += 1;
    else if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (c === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") i += 1;
        else if (src[i] === "$" && src[i + 1] === "(") {
          const inner = findClosingParen(src, i + 2);
          if (inner < 0) return -1;
          i = inner;
        }
        i += 1;
      }
    } else if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findBacktick(src: string, from: number): number {
  for (let i = from; i < src.length; i += 1) {
    if (src[i] === "\\") i += 1;
    else if (src[i] === "`") return i;
  }
  return -1;
}

function toCommand(words: Word[], piped: boolean, exported: Record<string, string>): SimpleCommand {
  let start = 0;
  while (start < words.length && KEYWORDS.has(words[start]?.text ?? "")) start += 1;
  const env: Record<string, string> = { ...exported };
  while (start < words.length) {
    const text = words[start]?.text ?? "";
    if (!ASSIGNMENT.test(text)) break;
    const eq = text.indexOf("=");
    env[text.slice(0, eq)] = text.slice(eq + 1);
    start += 1;
  }
  const rest = words.slice(start);
  // `export NAME=value ...` changes the environment of later commands in the same line.
  if (rest[0]?.text === "export") {
    for (const word of rest.slice(1)) {
      if (ASSIGNMENT.test(word.text)) {
        const eq = word.text.indexOf("=");
        exported[word.text.slice(0, eq)] = word.text.slice(eq + 1);
      }
    }
  } else if (rest.length === 0) {
    // A bare assignment: assume it reaches later commands (the cautious reading).
    for (const [name, value] of Object.entries(env)) exported[name] = value;
  }
  return { words: rest, env, piped, stdinText: null };
}

function scan(src: string, depth: number, state: State): void {
  if (depth > MAX_DEPTH) {
    state.truncated = true;
    return;
  }
  let words: Word[] = [];
  let cur = "";
  let hasCur = false;
  let dynamic = false;
  let skipWord = false;
  let piped = false;
  let nextPiped = false;
  let hereString = false;
  /** Here-documents declared by the command being built, then waiting for their body. */
  let declared: Array<{ delimiter: string; strip: boolean }> = [];
  const waiting: Array<{ delimiter: string; strip: boolean; owner: SimpleCommand }> = [];
  let hereStringText: string | null = null;

  const pushWord = (): void => {
    if (hasCur) {
      if (skipWord) {
        if (hereString) hereStringText = cur;
      } else {
        words.push({ text: cur, dynamic });
      }
      skipWord = false;
      hereString = false;
    }
    cur = "";
    hasCur = false;
    dynamic = false;
  };

  const endCommand = (): void => {
    pushWord();
    if (words.length > 0 || hereStringText !== null) {
      if (state.commands.length >= MAX_COMMANDS) {
        state.truncated = true;
      } else {
        const command = toCommand(words, piped, state.exported);
        command.stdinText = hereStringText;
        state.commands.push(command);
        for (const spec of declared) waiting.push({ ...spec, owner: command });
      }
    }
    declared = [];
    words = [];
    piped = nextPiped;
    nextPiped = false;
    hereStringText = null;
  };

  const substitute = (inner: string): void => {
    scan(inner, depth + 1, state);
    cur += "$(…)";
    hasCur = true;
    dynamic = true;
  };

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i] ?? "";
    if (c === "\\") {
      if (src[i + 1] === "\n") {
        i += 2;
        continue;
      }
      cur += src[i + 1] ?? "";
      hasCur = true;
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      cur += end < 0 ? src.slice(i + 1) : src.slice(i + 1, end);
      hasCur = true;
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (c === '"') {
      hasCur = true;
      i += 1;
      while (i < n && src[i] !== '"') {
        const d = src[i] ?? "";
        if (d === "\\" && i + 1 < n) {
          const next = src[i + 1] ?? "";
          if ('"\\$`\n'.includes(next)) {
            if (next !== "\n") cur += next;
          } else cur += `\\${next}`;
          i += 2;
        } else if (d === "$" && src[i + 1] === "(") {
          const close = findClosingParen(src, i + 2);
          if (close < 0) {
            state.truncated = true;
            i = n;
          } else {
            substitute(src.slice(i + 2, close));
            i = close + 1;
          }
        } else if (d === "`") {
          const close = findBacktick(src, i + 1);
          if (close < 0) {
            state.truncated = true;
            i = n;
          } else {
            substitute(src.slice(i + 1, close));
            i = close + 1;
          }
        } else if (d === "$" && /[A-Za-z_{0-9]/.test(src[i + 1] ?? "")) {
          dynamic = true;
          cur += d;
          i += 1;
        } else if (d === "$" && SPECIAL_PARAMETERS.has(src[i + 1] ?? "")) {
          dynamic = true;
          cur += d;
          i += 1;
        } else {
          cur += d;
          i += 1;
        }
      }
      i += 1;
      continue;
    }
    if (c === "$") {
      const next = src[i + 1] ?? "";
      if (next === "(") {
        if (src[i + 2] === "(") {
          // Arithmetic expansion: skip it, value unknown.
          const close = findClosingParen(src, i + 2);
          cur += "$((…))";
          hasCur = true;
          dynamic = true;
          i = close < 0 ? n : close + 1;
          continue;
        }
        const close = findClosingParen(src, i + 2);
        if (close < 0) {
          state.truncated = true;
          i = n;
        } else {
          substitute(src.slice(i + 2, close));
          i = close + 1;
        }
        continue;
      }
      if (next === "'") {
        const end = src.indexOf("'", i + 2);
        cur += end < 0 ? src.slice(i + 2) : src.slice(i + 2, end);
        hasCur = true;
        i = end < 0 ? n : end + 1;
        continue;
      }
      if (/[A-Za-z_{0-9]/.test(next) || SPECIAL_PARAMETERS.has(next)) {
        dynamic = true;
        hasCur = true;
        cur += c;
        i += 1;
        continue;
      }
      cur += c;
      hasCur = true;
      i += 1;
      continue;
    }
    if (c === "`") {
      const close = findBacktick(src, i + 1);
      if (close < 0) {
        state.truncated = true;
        i = n;
      } else {
        substitute(src.slice(i + 1, close));
        i = close + 1;
      }
      continue;
    }
    if (c === " " || c === "\t" || c === "\r") {
      pushWord();
      i += 1;
      continue;
    }
    if (c === "\n") {
      endCommand();
      i += 1;
      // A here-document body starts on the next line.
      while (waiting.length > 0) {
        const spec = waiting.shift();
        if (spec === undefined) break;
        const lines: string[] = [];
        while (i < n) {
          const end = src.indexOf("\n", i);
          const line = src.slice(i, end < 0 ? n : end);
          i = end < 0 ? n : end + 1;
          const compare = spec.strip ? line.replace(/^\t+/, "") : line;
          if (compare === spec.delimiter) break;
          lines.push(line);
        }
        spec.owner.stdinText = `${spec.owner.stdinText ?? ""}${lines.join("\n")}\n`;
      }
      continue;
    }
    if (c === ";" || c === "(" || c === ")") {
      endCommand();
      i += 1;
      continue;
    }
    if (c === "&") {
      if (src[i + 1] === ">") {
        // `&>` redirects both streams; the target word is dropped.
        pushWord();
        i += src[i + 2] === ">" ? 3 : 2;
        skipWord = true;
        continue;
      }
      endCommand();
      i += src[i + 1] === "&" ? 2 : 1;
      continue;
    }
    if (c === "|") {
      const logicalOr = src[i + 1] === "|";
      nextPiped = !logicalOr;
      endCommand();
      i += logicalOr || src[i + 1] === "&" ? 2 : 1;
      continue;
    }
    if (c === "<" || c === ">") {
      // A leading file-descriptor number belongs to the redirection, not to a word.
      if (hasCur && /^\d+$/.test(cur)) {
        cur = "";
        hasCur = false;
      } else pushWord();
      if (c === "<" && src[i + 1] === "<" && src[i + 2] === "<") {
        i += 3;
        skipWord = true;
        hereString = true;
        continue;
      }
      if (c === "<" && src[i + 1] === "<") {
        i += 2;
        const strip = src[i] === "-";
        if (strip) i += 1;
        while (src[i] === " " || src[i] === "\t") i += 1;
        let delimiter = "";
        while (i < n && !" \t\n;&|<>()".includes(src[i] ?? "")) {
          delimiter += src[i] ?? "";
          i += 1;
        }
        declared.push({ delimiter: delimiter.replace(/['"\\]/g, ""), strip });
        continue;
      }
      i += c === ">" && src[i + 1] === ">" ? 2 : 1;
      if (src[i] === "&") i += 1;
      skipWord = true;
      continue;
    }
    cur += c;
    hasCur = true;
    i += 1;
  }
  endCommand();
}

/** Splits a shell command line into simple commands. Never throws. */
export function parseShell(source: string): ParseResult {
  const state: State = { commands: [], truncated: false, exported: {} };
  if (source.length > MAX_SOURCE) {
    state.truncated = true;
    scan(source.slice(0, MAX_SOURCE), 0, state);
  } else {
    scan(source, 0, state);
  }
  return { commands: state.commands, truncated: state.truncated };
}
