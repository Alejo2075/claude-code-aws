import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type Env = Record<string, string | undefined>;

/** Variables a build tool needs to run, and nothing that grants access to AWS or to a service. */
const BASE_ENV_ALLOWLIST = [
  "PATH",
  "Path",
  "PATHEXT",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TEMP",
  "TMP",
  "SystemRoot",
  "SYSTEMROOT",
  "ComSpec",
  "LANG",
  "LC_ALL",
  "TERM",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
];

/** The AWS variables passed on only when the caller explicitly asks for AWS access. */
export const AWS_ENV_ALLOWLIST = [
  "AWS_PROFILE",
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_CONFIG_FILE",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_SDK_LOAD_CONFIG",
  "AWS_EC2_METADATA_DISABLED",
  "AWS_ENDPOINT_URL",
];

/**
 * Builds a child environment from an allowlist. Anything else in `source`, including AWS
 * credentials, tokens, and `NODE_OPTIONS`, is left out. `extra` is added last.
 */
export function scrubbedEnv(
  source: Env,
  options: {
    allowAws?: boolean;
    extraAllow?: readonly string[];
    extra?: Record<string, string>;
  } = {},
): Record<string, string> {
  const allow = new Set([
    ...BASE_ENV_ALLOWLIST,
    ...(options.allowAws === true ? AWS_ENV_ALLOWLIST : []),
    ...(options.extraAllow ?? []),
  ]);
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && allow.has(name)) env[name] = value;
  }
  return { ...env, ...options.extra };
}

/**
 * The real location of a path that may not exist yet: the nearest existing ancestor is resolved
 * through links, and the missing part is appended. Judging a new file lexically would let a link
 * in the middle of the path point outside the project.
 */
function realLocation(path: string): string {
  let current = resolve(path);
  const missing: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    missing.unshift(basename(current));
    current = parent;
  }
  return join(existsSync(current) ? realpathSync(current) : current, ...missing);
}

/** True when `path` is `root` or inside it, after resolving links. `path` need not exist. */
export function isInside(root: string, path: string): boolean {
  const rel = relative(realLocation(root), realLocation(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** Finds a project-local executable (`node_modules/.bin/<name>`), walking up to `root`. */
export function findLocalBin(root: string, name: string): string | null {
  const suffixes = process.platform === "win32" ? [".cmd", ".exe", ""] : [""];
  let dir = resolve(root);
  for (let depth = 0; depth < 20; depth += 1) {
    for (const suffix of suffixes) {
      const candidate = join(dir, "node_modules", ".bin", `${name}${suffix}`);
      if (existsSync(candidate)) return candidate;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Finds the JavaScript entry of a package's command (`node_modules/<package>/package.json` `bin`),
 * walking up from `root`. Run it with `process.execPath`: that works the same on every platform and
 * never needs a shell, unlike the `.cmd` shims in `node_modules/.bin` on Windows.
 */
export function findPackageBin(root: string, packageName: string, binName?: string): string | null {
  let dir = resolve(root);
  for (let depth = 0; depth < 20; depth += 1) {
    const manifest = join(dir, "node_modules", packageName, "package.json");
    if (existsSync(manifest)) {
      try {
        const bin = (
          JSON.parse(readFileSync(manifest, "utf8")) as { bin?: string | Record<string, string> }
        ).bin;
        const relativePath = typeof bin === "string" ? bin : bin?.[binName ?? packageName];
        if (relativePath === undefined) return null;
        const target = resolve(dir, "node_modules", packageName, relativePath);
        return existsSync(target) && isInside(join(dir, "node_modules", packageName), target)
          ? target
          : null;
      } catch {
        return null;
      }
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Finds an executable on `PATH` without running anything. */
export function findOnPath(name: string, pathValue: string | undefined): string | null {
  const suffixes = process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];
  for (const dir of (pathValue ?? "").split(delimiter)) {
    if (dir === "") continue;
    for (const suffix of suffixes) {
      const candidate = join(dir, `${name}${suffix}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export interface RunOptions {
  command: string;
  args: readonly string[];
  /** The project directory. The working directory must be inside it. */
  root: string;
  cwd?: string;
  env: Record<string, string>;
  timeoutMs: number;
  /** Most bytes kept from each of stdout and stderr. */
  maxOutputBytes: number;
}

export interface RunResult {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  timedOut: boolean;
  durationMs: number;
  /** The process could not be started at all (missing executable). */
  spawnError: string | null;
}

/** Windows command shims (`.cmd`, `.bat`) need cmd.exe, which means building a shell command line. */
const WINDOWS_SHIM = /\.(cmd|bat)$/i;

/**
 * Runs a program with no shell. The caller decides the allowlisted environment; this function
 * enforces the timeout, kills the whole process group on expiry, bounds the output, and refuses a
 * working directory outside the project.
 */
export function runTool(options: RunOptions): Promise<RunResult> {
  const started = Date.now();
  const cwd = options.cwd ?? options.root;
  const empty = (spawnError: string): RunResult => ({
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    timedOut: false,
    durationMs: Date.now() - started,
    spawnError,
  });
  if (!isInside(options.root, cwd))
    return Promise.resolve(empty("The working directory is outside the project."));
  if (process.platform === "win32" && WINDOWS_SHIM.test(options.command)) {
    return Promise.resolve(
      empty(
        "UNSUPPORTED_WINDOWS_SHIM: run the package's JavaScript entry with node instead (see findPackageBin).",
      ),
    );
  }
  const prepared = { command: options.command, args: [...options.args] };

  return new Promise((resolvePromise) => {
    const posix = process.platform !== "win32";
    const child = spawn(prepared.command, prepared.args, {
      cwd,
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: posix,
    });
    const chunks = { out: [] as Buffer[], err: [] as Buffer[] };
    const size = { out: 0, err: 0 };
    const truncated = { out: false, err: false };
    const keep = (kind: "out" | "err") => (chunk: Buffer) => {
      const room = options.maxOutputBytes - size[kind];
      if (room <= 0) {
        truncated[kind] = true;
        return;
      }
      const piece = chunk.length > room ? chunk.subarray(0, room) : chunk;
      if (chunk.length > room) truncated[kind] = true;
      chunks[kind].push(piece);
      size[kind] += piece.length;
    };
    child.stdout.on("data", keep("out"));
    child.stderr.on("data", keep("err"));

    let timedOut = false;
    const stop = (): void => {
      try {
        if (posix && child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        // Already gone.
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, options.timeoutMs);

    const finish = (
      exitCode: number | null,
      signal: string | null,
      spawnError: string | null,
    ): void => {
      clearTimeout(timer);
      resolvePromise({
        exitCode,
        signal,
        stdout: Buffer.concat(chunks.out).toString("utf8"),
        stderr: Buffer.concat(chunks.err).toString("utf8"),
        stdoutTruncated: truncated.out,
        stderrTruncated: truncated.err,
        timedOut,
        durationMs: Date.now() - started,
        spawnError,
      });
    };
    child.on("error", (error) => {
      finish(
        null,
        null,
        error.name === "Error" && "code" in error
          ? String((error as NodeJS.ErrnoException).code)
          : error.name,
      );
    });
    child.on("close", (code, signal) => {
      finish(code, signal, null);
    });
  });
}

export { sep as PATH_SEPARATOR };
