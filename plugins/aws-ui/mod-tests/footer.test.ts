// Run with `claude plugin test` (see package.json "test:mod"). The kit stands in for Claude Code:
// files, environment, and the session are stubbed, so no session, sign-in, or network is involved.
import { expect, mock, test } from "claude-code/testing";

// sha256("/work/project") truncated to 16 hex characters, as the contract's workspaceId computes it.
const WORKSPACE_ID = "65d80d2c48b3d23b";
const HOME = "/home/test";
const SNAPSHOT = `${HOME}/.claude/aws-context/v1/${WORKSPACE_ID}.json`;
const VERIFIED_AT = "2026-01-01T12:00:00.000Z";
const STALE_AFTER = "2026-01-01T12:05:00.000Z";
const AT_MINUTE_1 = Date.parse("2026-01-01T12:01:00.000Z");
const SSO_ARN = "arn:aws:sts::123456789012:assumed-role/AWSReservedSSO_Dev_abc/carol@example.com";

// The gap this module puts before its own labels, so they never touch a neighbor's.
const GAP = "\u00a0\u00a0\u00a0";

const FOOTER = {
  plugin: "aws-ui",
  surface: "terminal",
  component: "SessionMode",
  requestId: "footer",
  viewport: { columns: 120, rows: 40 },
} as const;

function snapshot(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    profile: "personal",
    region: "us-east-1",
    accountId: "123456789012",
    principalArn: SSO_ARN,
    environment: "production",
    verification: "verified",
    verifiedAt: VERIFIED_AT,
    staleAfter: STALE_AFTER,
    diagnosticCode: null,
    ...overrides,
  });
}

/** Claude Code hands the stubs absolute native paths: normalize Windows ones to the map's keys. */
const posix = (path: string): string => path.replace(/\\/g, "/").replace(/^[A-Za-z]:/, "");

/**
 * Stubs the file system and the session, and records the footer labels that reach Claude Code's own
 * renderer (the stub for `ui.render` stands in for it). `existing` stands for labels already there.
 */
function world(on: any, files: Map<string, string>, existing: string[] = []) {
  const seen = { modes: [] as readonly string[] };
  on("session.start", () => ({ cwd: "/work/project" }));
  on("env.get", ($: unknown, e: { name: string }) => ({
    value: e.name === "HOME" ? HOME : undefined,
  }));
  on("session.root", () => ({ value: "/work/project" }));
  on("fs.stat", ($: unknown, e: { path: string }) => {
    const text = files.get(posix(e.path));
    return text === undefined
      ? { deny: "ENOENT" }
      : { value: { kind: "file", size: text.length, mtimeMs: text.length, isLink: false } };
  });
  on("fs.read", ($: unknown, e: { path: string }) => {
    const text = files.get(posix(e.path));
    return text === undefined ? { deny: "ENOENT" } : { value: text };
  });
  on("ui.render", ($: unknown, e: { component: string; props: { modes?: readonly string[] } }) => {
    if (e.component !== "SessionMode") return { type: "Text", props: {}, children: ["hint"] };
    seen.modes = e.props.modes ?? [];
    return { type: "Text", props: {}, children: [(e.props.modes ?? []).join(" & ")] };
  });
  return { seen, existing };
}

async function footer($: any, w: { seen: { modes: readonly string[] }; existing: string[] }) {
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/project" });
  await $.ui.mount({ ...FOOTER, props: { modes: w.existing } });
  return w.seen.modes;
}

test("shows user, region and environment, and no warning when verified", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot()]]));
  expect(await footer($, w)).toEqual([`${GAP}carol@example.com · us-east-1 · production`]);
});

test("leaves out what is not available", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot({ region: null, environment: "unknown" })]]));
  expect(await footer($, w)).toEqual([`${GAP}carol@example.com`]);
});

test("never shows the account id or the profile", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot()]]));
  const modes = (await footer($, w)).join(" ");
  expect(modes).not.toContain("123456789012");
  expect(modes).not.toContain("personal");
});

test("shows nothing at all when aws-context has stored nothing", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map());
  expect(await footer($, w)).toEqual([]);
});

test("adds to the labels Claude Code already shows instead of replacing them", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot()]]), ["focus"]);
  expect(await footer($, w)).toEqual(["focus", `${GAP}carol@example.com · us-east-1 · production`]);
});

test("leaves the footer untouched when there is nothing to add", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map(), ["focus"]);
  expect(await footer($, w)).toEqual(["focus"]);
});

test("warns, and keeps the last known identity, once the window passes", async ($, on) => {
  const clock = mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot()]]));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/project" });
  await clock.advance(6 * 60_000);
  await $.ui.mount({ ...FOOTER, props: { modes: [] } });
  expect(w.seen.modes).toEqual([
    `${GAP}carol@example.com · us-east-1 · production`,
    "AWS check stale",
  ]);
});

test("warns about an expired session", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(
    on,
    new Map([[SNAPSHOT, snapshot({ verification: "expired", diagnosticCode: "SSO_EXPIRED" })]]),
  );
  expect(await footer($, w)).toEqual([
    `${GAP}carol@example.com · us-east-1 · production`,
    "AWS session expired",
  ]);
});

test("ignores a corrupt or hostile snapshot", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(
    on,
    new Map([
      [SNAPSHOT, snapshot({ verification: "verified", accountId: null, environment: "unknown" })],
    ]),
  );
  expect(await footer($, w)).toEqual([]);
});

test("picks up a refresh written while the session runs", async ($, on) => {
  const clock = mock.clock(on, { now: AT_MINUTE_1 });
  const files = new Map<string, string>();
  const w = world(on, files);
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/project" });
  files.set(SNAPSHOT, snapshot());
  await clock.advance(5_000);
  await $.ui.mount({ ...FOOTER, props: { modes: [] } });
  expect(w.seen.modes).toEqual([`${GAP}carol@example.com · us-east-1 · production`]);
});

test("puts a gap before its labels so they never touch a neighbor's", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot()]]), ["focus"]);
  const modes = await footer($, w);
  expect(modes[1]?.startsWith(GAP)).toBe(true);
  // Non-breaking, so a neighbor that trims or collapses spaces cannot close the gap.
  expect(GAP).not.toContain(" ");
});

test("shrinks to the room left instead of pushing a neighbor to a second line", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot()]]));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/project" });
  await $.ui.mount({ ...FOOTER, viewport: { columns: 70, rows: 40 }, props: { modes: [] } });
  expect(w.seen.modes).toEqual([`${GAP}carol@examp… · production`]);
});

test("gives up everything but the warning on a very narrow row", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(
    on,
    new Map([[SNAPSHOT, snapshot({ verification: "expired", diagnosticCode: "SSO_EXPIRED" })]]),
  );
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/project" });
  await $.ui.mount({ ...FOOTER, viewport: { columns: 50, rows: 40 }, props: { modes: [] } });
  expect(w.seen.modes).toEqual([`${GAP}AWS session expired`]);
});

test("leaves room for labels other mods already added and for the hint", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  const w = world(on, new Map([[SNAPSHOT, snapshot()]]));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/project" });
  await $.ui.mount({
    plugin: "aws-ui",
    surface: "terminal",
    component: "PromptHint",
    requestId: "hint",
    viewport: { columns: 120, rows: 40 },
    props: { isDraft: false, isWorking: false, hint: "? for shortcuts · ctrl+t to hide tasks" },
  });
  await $.ui.mount({ ...FOOTER, props: { modes: ["narrator on"] } });
  // 120 columns would fit the full label; the hint and the other label leave less.
  const mine = w.seen.modes[1] ?? "";
  expect(mine.startsWith(GAP)).toBe(true);
  expect(mine.length - GAP.length).toBeLessThan(
    "carol@example.com · us-east-1 · production".length,
  );
});
