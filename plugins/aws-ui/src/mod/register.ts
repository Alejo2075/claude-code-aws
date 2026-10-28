// The aws-ui hooks module. It runs inside Claude Code, which gives it no Node APIs, no network of
// its own, and no way to import outside this plugin. It only reads the snapshot file that
// aws-context writes, through $.fs, and draws one line. It never calls AWS.
//
// Keep every `$.namespace.method` call written in full (no aliasing of `$` or its namespaces) and
// the event names string literals: `claude plugin validate` reads them statically.
import {
  type AwsContextSnapshotV1,
  type ConfigLayer,
  formatBar,
  interpret,
  type Interpretation,
  MAX_CONFIG_BYTES,
  MAX_SNAPSHOT_BYTES,
  parseConfig,
  parseSnapshot,
  snapshotPath,
  type Tone,
  toneOf,
  userConfigPath,
  workspaceId,
} from "@claude-code-aws/context-contract";

import type { ModApi, RenderEvent } from "./api.js";

/** How often the files are checked. Cheap (one stat each); no AWS and no process spawn. */
const POLL_MS = 5000;

let snapshot: AwsContextSnapshotV1 | null = null;
let preferences: Pick<ConfigLayer, "maskAccountId" | "showProfile"> = {};
let snapshotStamp = "";
let configStamp = "";
let lastState = "";

const TONE_COLOR: Record<Tone, string | undefined> = {
  ok: "green",
  alert: "red",
  warn: "yellow",
  danger: "red",
  muted: undefined,
};

async function readEnv($: ModApi): Promise<(name: string) => string | undefined> {
  // Names must be string literals so validation can list exactly which variables are read.
  const values: Record<string, string | undefined> = {
    CLAUDE_CONFIG_DIR: await $.env.get("CLAUDE_CONFIG_DIR"),
    USERPROFILE: await $.env.get("USERPROFILE"),
    HOME: await $.env.get("HOME"),
  };
  return (name) => values[name];
}

/** Text of a small file, or null when it is missing, too large, or unreadable. Also a change stamp. */
async function readSmall(
  $: ModApi,
  path: string,
  limit: number,
): Promise<{ text: string | null; stamp: string }> {
  try {
    const info = await $.fs.stat(path);
    const stamp = `${info.size}:${info.mtimeMs}`;
    if (info.size > limit) return { text: null, stamp };
    return { text: await $.fs.read(path), stamp };
  } catch {
    return { text: null, stamp: "missing" };
  }
}

async function refreshFromDisk($: ModApi): Promise<void> {
  const env = await readEnv($);
  const root = await $.session.root();

  const configPath = userConfigPath(env);
  if (configPath !== null) {
    const config = await readSmall($, configPath, MAX_CONFIG_BYTES);
    if (config.stamp !== configStamp) {
      configStamp = config.stamp;
      preferences = config.text === null ? {} : parseConfig(config.text, "user").layer;
    }
  }

  const path = snapshotPath(env, await workspaceId(root));
  if (path === null) {
    snapshot = null;
    snapshotStamp = "";
  } else {
    const stored = await readSmall($, path, MAX_SNAPSHOT_BYTES);
    // Re-parse each poll only when the file changed; the file is untrusted input either way.
    if (`${path}|${stored.stamp}` !== snapshotStamp) {
      snapshotStamp = `${path}|${stored.stamp}`;
      const parsed = stored.text === null ? null : parseSnapshot(stored.text);
      snapshot = parsed?.ok === true ? parsed.snapshot : null;
      lastState = "";
    }
  }

  // Time passing can turn a verified snapshot stale without the file changing.
  const state = interpret(snapshot, await $.clock.now()).state;
  if (state !== lastState) {
    lastState = state;
    $.ui.invalidate("ui.render");
  }
}

function describe(interpretation: Interpretation, columns: number): string {
  return formatBar(interpretation, {
    maskAccountId: preferences.maskAccountId ?? true,
    showProfile: preferences.showProfile ?? true,
    width: Math.max(10, columns),
  });
}

export function register(on: (...args: unknown[]) => unknown): void {
  on("session.start", async ($: ModApi, e: unknown, next: (e: unknown) => unknown) => {
    // A failure to read must never stop the session or the mod: the band just shows its empty state.
    await refreshFromDisk($).catch(() => undefined);
    $.clock.every(POLL_MS, () => {
      refreshFromDisk($).catch(() => undefined);
    });
    return next(e);
  });

  on(
    "ui.render",
    { component: "AbovePrompt" },
    async ($: ModApi, e: RenderEvent, next: (e: RenderEvent) => Promise<unknown>) => {
      // Keep whatever other mods draw in the band.
      const rest = await next(e);
      // A survey owns the band while it shows; yield to it.
      if (e.props.hasSurvey) return rest;
      const { Box, Text } = $.ui.resolve(e);
      const interpretation = interpret(snapshot, await $.clock.now());
      const color = TONE_COLOR[toneOf(interpretation)];
      const line = Text({
        wrap: "truncate-end",
        ...(color === undefined ? { dimColor: true } : { color }),
        children: [describe(interpretation, e.props.bodyColumns)],
      });
      return Box({
        flexDirection: "column",
        children: rest === undefined || rest === null ? [line] : [line, rest],
      });
    },
  );
}
