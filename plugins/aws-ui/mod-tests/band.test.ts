// Run with `claude plugin test` (see package.json "test:mod"). The kit stands in for Claude Code:
// files, environment, and the session are stubbed, so no session, sign-in, or network is involved.
import { expect, mock, test } from "claude-code/testing";

// sha256("/work/project") truncated to 16 hex characters, as the contract's workspaceId computes it.
const WORKSPACE_ID = "65d80d2c48b3d23b";
const HOME = "/home/test";
const SNAPSHOT = `${HOME}/.claude/aws-context/v1/${WORKSPACE_ID}.json`;
const CONFIG = `${HOME}/.claude/aws-context/config.json`;
const VERIFIED_AT = "2026-01-01T12:00:00.000Z";
const STALE_AFTER = "2026-01-01T12:05:00.000Z";
const AT_MINUTE_1 = Date.parse("2026-01-01T12:01:00.000Z");

const PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
} as const;
const BAND = {
  plugin: "aws-ui",
  surface: "terminal",
  component: "AbovePrompt",
  requestId: "band",
  viewport: { columns: 120, rows: 40 },
  props: PROPS,
} as const;

function snapshot(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 1,
    workspaceId: WORKSPACE_ID,
    profile: null,
    region: "us-east-1",
    accountId: "123456789012",
    principalArn: "arn:aws:sts::123456789012:assumed-role/Developer/session",
    environment: "production",
    verification: "verified",
    verifiedAt: VERIFIED_AT,
    staleAfter: STALE_AFTER,
    diagnosticCode: null,
    ...overrides,
  });
}

/** Stubs the file system with an in-memory map and the session with a fixed project. */
function world(
  on: (name: string, stub: (...args: any[]) => unknown) => void,
  files: Map<string, string>,
) {
  on("session.start", () => ({ cwd: "/work/project" }));
  on("env.get", ($: unknown, e: { name: string }) => ({
    value: e.name === "HOME" ? HOME : undefined,
  }));
  on("session.root", () => ({ value: "/work/project" }));
  on("fs.stat", ($: unknown, e: { path: string }) => {
    const text = files.get(e.path);
    return text === undefined
      ? { deny: "ENOENT" }
      : { value: { kind: "file", size: text.length, mtimeMs: text.length, isLink: false } };
  });
  on("fs.read", ($: unknown, e: { path: string }) => {
    const text = files.get(e.path);
    return text === undefined ? { deny: "ENOENT" } : { value: text };
  });
  // What Claude Code itself would draw in the band: nothing to add, but the hook must keep it.
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by another mod"] }));
}

async function start($: any) {
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/project" });
}

test("shows an empty state when aws-context has stored nothing", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(on, new Map());
  await start($);
  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: "AWS · not configured" })).toBeDefined();
});

test("shows a masked, verified production context", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(on, new Map([[SNAPSHOT, snapshot()]]));
  await start($);
  const ui = await $.ui.mount(BAND);
  expect(
    await ui.find({ type: "Text", text: "AWS · 1234…9012 · us-east-1 · production · verified" }),
  ).toBeDefined();
  // The full account id never reaches the screen by default.
  expect(await ui.find({ type: "Text", text: /123456789012/ })).toBeUndefined();
});

test("keeps what another mod drew in the band", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(on, new Map([[SNAPSHOT, snapshot()]]));
  await start($);
  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: "drawn by another mod" })).toBeDefined();
});

test("never presents an old verification as current once the window passes", async ($, on) => {
  const clock = mock.clock(on, { now: AT_MINUTE_1 });
  world(on, new Map([[SNAPSHOT, snapshot()]]));
  await start($);
  await clock.advance(6 * 60_000);
  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: /last known 1234…9012/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /stale/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /· verified$/ })).toBeUndefined();
});

test("shows a failed identity check as non-current", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(
    on,
    new Map([[SNAPSHOT, snapshot({ verification: "expired", diagnosticCode: "SSO_EXPIRED" })]]),
  );
  await start($);
  const ui = await $.ui.mount(BAND);
  expect(
    await ui.find({ type: "Text", text: /last known 1234…9012.*expired \(SSO session\)/ }),
  ).toBeDefined();
});

test("ignores a corrupt or hostile snapshot", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(
    on,
    new Map([
      [SNAPSHOT, snapshot({ verification: "verified", accountId: null, environment: "unknown" })],
    ]),
  );
  await start($);
  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: "AWS · not configured" })).toBeDefined();
});

test("follows the user's preference to show the full account", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(
    on,
    new Map([
      [SNAPSHOT, snapshot()],
      [CONFIG, JSON.stringify({ version: 1, ui: { maskAccountId: false } })],
    ]),
  );
  await start($);
  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: /123456789012/ })).toBeDefined();
});

test("picks up a refresh written while the session runs", async ($, on) => {
  const clock = mock.clock(on, { now: AT_MINUTE_1 });
  const files = new Map<string, string>();
  world(on, files);
  await start($);
  files.set(SNAPSHOT, snapshot());
  await clock.advance(5_000);
  const ui = await $.ui.mount(BAND);
  expect(await ui.find({ type: "Text", text: /1234…9012/ })).toBeDefined();
});

test("yields the band to a survey", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(on, new Map([[SNAPSHOT, snapshot()]]));
  await start($);
  const ui = await $.ui.mount({ ...BAND, props: { ...PROPS, hasSurvey: true } });
  expect(await ui.find({ type: "Text", text: /AWS/ })).toBeUndefined();
});

test("truncates to a narrow band without losing the state", async ($, on) => {
  mock.clock(on, { now: AT_MINUTE_1 });
  world(on, new Map([[SNAPSHOT, snapshot({ profile: "a-long-profile-name" })]]));
  await start($);
  const ui = await $.ui.mount({ ...BAND, props: { ...PROPS, bodyColumns: 30 } });
  const found = await ui.find({ type: "Text", text: /verified/ });
  expect(found).toBeDefined();
});
