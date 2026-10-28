// The aws-ui hooks module. It runs inside Claude Code, which gives it no Node APIs, no network of
// its own, and no way to import outside this plugin. It only reads the snapshot file that
// aws-context writes and the user's own aws-context config (one preference), through $.fs, and adds
// labels to the prompt footer. It never calls AWS.
//
// The labels go in the footer's own mode list (`SessionMode`, where Claude Code shows `focus` or
// `memory paused`), so they take no extra row and use Claude Code's own colors and type. The
// module draws nothing itself.
//
// Keep every `$.namespace.method` call written in full (no aliasing of `$` or its namespaces) and
// the event names string literals: `claude plugin validate` reads them statically.
import {
  type AwsContextSnapshotV1,
  cellWidth,
  footerLabels,
  interpret,
  MAX_CONFIG_BYTES,
  MAX_SNAPSHOT_BYTES,
  parseConfig,
  parseSnapshot,
  snapshotPath,
  userConfigPath,
  workspaceId,
} from "@claude-code-aws/context-contract";

import type { HintEvent, ModApi, ModeEvent } from "./api.js";

/** How often the snapshot is checked. Cheap (one stat); no AWS and no process spawn. */
const POLL_MS = 5000;

// Layout. The prompt footer is one row shared with Claude Code's own mode label, its hint, and
// whatever other mods draw (a usage meter, a narrator switch). This module takes only what is
// left, caps itself, and keeps a margin for them, so it never pushes another plugin to a second
// line. The figures are the footer's: two columns of padding at each end, two between the mode
// label and what follows, and the longest mode label.
const FOOTER_PADDING = 4;
const FOOTER_GAP = 2;
const MODE_LABEL = 20;
/** Columns kept free for other mods' drawings (a usage meter at its barest is about this wide). */
const RESERVE = 16;
/** The most this module ever takes of the row. */
const MAX_WIDTH = 64;
/** Separates this module's labels from whatever comes before them, whoever that is. A non-breaking space cannot be trimmed or collapsed by a neighbor. */
const GAP = "\u00a0\u00a0\u00a0";
const MODE_SEPARATOR = " & ";

/** The hint line as last seen, in columns: it shares the row with the labels. */
let hintWidth = 0;

let snapshot: AwsContextSnapshotV1 | null = null;
let snapshotStamp = "";
/** The user's choice (from their own aws-context config) to show the user name. On by default. */
let showUser = true;
let configStamp = "";
/** What the footer last drew from, so it is redrawn only when that changes. */
let lastShape = "";
/** The running poll, kept so a second session start replaces it instead of adding another. */
let poller: { cancel: () => void } | null = null;

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
  await refreshPreferences($, env);
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
      lastShape = "";
    }
  }

  // Time passing can turn a verified snapshot stale without the file changing.
  const shape = `${interpret(snapshot, await $.clock.now()).state}|${showUser}`;
  if (shape !== lastShape) {
    lastShape = shape;
    $.ui.invalidate("ui.render");
  }
}

/** Reads the one preference this module honors, from the user's own file only (never the project). */
async function refreshPreferences(
  $: ModApi,
  env: (name: string) => string | undefined,
): Promise<void> {
  const path = userConfigPath(env);
  if (path === null) return;
  const stored = await readSmall($, path, MAX_CONFIG_BYTES);
  if (`${path}|${stored.stamp}` === configStamp) return;
  configStamp = `${path}|${stored.stamp}`;
  const parsed = stored.text === null ? null : parseConfig(stored.text, "user");
  showUser = parsed?.layer.showUser ?? true;
  lastShape = "";
}

function roomFor(e: ModeEvent): number {
  const columns = e.viewport?.columns;
  if (e.surface !== "terminal" || columns === undefined) return MAX_WIDTH;
  const others = cellWidth(e.props.modes.join(MODE_SEPARATOR));
  const taken =
    FOOTER_PADDING +
    FOOTER_GAP +
    MODE_LABEL +
    (hintWidth > 0 ? 1 + hintWidth : 0) +
    (others > 0 ? others + MODE_SEPARATOR.length : 0) +
    cellWidth(GAP) +
    RESERVE;
  return Math.max(0, Math.min(MAX_WIDTH, columns - taken));
}

export function register(on: (...args: unknown[]) => unknown): void {
  on("session.start", async ($: ModApi, e: unknown, next: (e: unknown) => unknown) => {
    // A failure to read must never stop the session or the mod: the footer just shows nothing.
    await refreshFromDisk($).catch(() => undefined);
    poller?.cancel();
    poller = $.clock.every(POLL_MS, () => {
      refreshFromDisk($).catch(() => undefined);
    });
    return next(e);
  });

  on(
    "ui.render",
    { component: "SessionMode" },
    async ($: ModApi, e: ModeEvent, next: (e: ModeEvent) => unknown) => {
      const { identity, warning } = footerLabels(interpret(snapshot, await $.clock.now()), {
        room: roomFor(e),
        showUser,
      });
      const added = [identity, warning].filter((label): label is string => label !== null);
      // Nothing to say (verified with nothing to show, or no context): leave the footer untouched.
      if (added.length === 0) return next(e);
      added[0] = `${GAP}${added[0] ?? ""}`;
      return next({ ...e, props: { ...e.props, modes: [...e.props.modes, ...added] } });
    },
  );

  // Observe only: the hint shares the row, so its width tells the labels how much room is left.
  on(
    "ui.render",
    { component: "PromptHint" },
    ($: ModApi, e: HintEvent, next: (e: HintEvent) => unknown) => {
      const width = cellWidth(e.props.hint);
      if (e.surface === "terminal" && width !== hintWidth) {
        hintWidth = width;
        $.ui.invalidate("ui.render");
      }
      return next(e);
    },
  );
}
