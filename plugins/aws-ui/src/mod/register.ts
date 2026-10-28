// The aws-ui hooks module. It runs inside Claude Code, which gives it no Node APIs, no network of
// its own, and no way to import outside this plugin. It only reads the snapshot file that
// aws-context writes, through $.fs, and adds labels to the prompt footer. It never calls AWS.
//
// The labels go in the footer's own mode list (`SessionMode`, where Claude Code shows `focus` or
// `memory paused`), so they take no extra row and use Claude Code's own colors and type. The
// module draws nothing itself.
//
// Keep every `$.namespace.method` call written in full (no aliasing of `$` or its namespaces) and
// the event names string literals: `claude plugin validate` reads them statically.
import {
  type AwsContextSnapshotV1,
  footerLabels,
  interpret,
  MAX_SNAPSHOT_BYTES,
  parseSnapshot,
  snapshotPath,
  workspaceId,
} from "@claude-code-aws/context-contract";

import type { ModApi, ModeEvent } from "./api.js";

/** How often the snapshot is checked. Cheap (one stat); no AWS and no process spawn. */
const POLL_MS = 5000;

let snapshot: AwsContextSnapshotV1 | null = null;
let snapshotStamp = "";
let lastState = "";

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
  const path = snapshotPath(env, await workspaceId(await $.session.root()));
  if (path === null) {
    snapshot = null;
    snapshotStamp = "";
  } else {
    const stored = await readSmall($, path, MAX_SNAPSHOT_BYTES);
    // Re-parse only when the file changed; the file is untrusted input either way.
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

export function register(on: (...args: unknown[]) => unknown): void {
  on("session.start", async ($: ModApi, e: unknown, next: (e: unknown) => unknown) => {
    // A failure to read must never stop the session or the mod: the footer just shows nothing.
    await refreshFromDisk($).catch(() => undefined);
    $.clock.every(POLL_MS, () => {
      refreshFromDisk($).catch(() => undefined);
    });
    return next(e);
  });

  on(
    "ui.render",
    { component: "SessionMode" },
    async ($: ModApi, e: ModeEvent, next: (e: ModeEvent) => unknown) => {
      const { identity, warning } = footerLabels(interpret(snapshot, await $.clock.now()));
      const added = [identity, warning].filter((label): label is string => label !== null);
      // Nothing to say (verified with nothing to show, or no context): leave the footer untouched.
      if (added.length === 0) return next(e);
      return next({ ...e, props: { ...e.props, modes: [...e.props.modes, ...added] } });
    },
  );
}
