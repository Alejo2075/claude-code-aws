// TEMPLATE-TODO: replace with tests for the plugin's real behavior, including negative cases:
// wrong account, wrong region, expired credentials, missing permissions, unavailable data, and
// attempted unsafe mutations.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { runPluginHooks, sessionStartInput } from "@claude-code-aws/testkit";
import { describe, expect, it } from "vitest";

import { nodeMajorVersion, parseHookInput } from "../src/lib/hook-runtime.js";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("hook runtime", () => {
  it("parses the documented common input fields", () => {
    const input = parseHookInput(JSON.stringify(sessionStartInput("/project")));
    expect(input.hook_event_name).toBe("SessionStart");
  });

  it("rejects payloads without an event name", () => {
    expect(() => parseHookInput(JSON.stringify({ cwd: "/project" }))).toThrow();
  });

  it("reads the Node major version", () => {
    expect(nodeMajorVersion("22.12.0")).toBe(22);
  });
});

describe("hooks.json wiring", () => {
  it.runIf(existsSync(join(pluginRoot, "dist")))(
    "runs the SessionStart hook from dist",
    async () => {
      const [result] = await runPluginHooks(sessionStartInput(pluginRoot), { pluginRoot });
      expect(result?.exitCode).toBe(0);
      expect(result?.secretFindings).toEqual([]);
    },
  );
});
