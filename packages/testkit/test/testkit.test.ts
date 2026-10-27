import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bashPreToolUseInput,
  findSecretLikeStrings,
  runPluginHooks,
  sessionStartInput,
} from "../src/index.js";

// Built from parts so that this file does not itself contain a credential-shaped literal.
const FAKE_KEY_ID = ["AKIA", "IOSFODNN7EXAMPLE"].join("");

describe("findSecretLikeStrings", () => {
  it("detects AWS access key ids without returning the value", () => {
    const findings = findSecretLikeStrings(`key=${FAKE_KEY_ID}`);
    expect(findings).toEqual([{ name: "aws-access-key-id", index: 4 }]);
  });

  it("ignores ordinary output", () => {
    expect(findSecretLikeStrings("Account 123456789012 in us-east-1")).toEqual([]);
  });
});

function fakePlugin(hookSource: string, hooksJson: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "fake-plugin-"));
  mkdirSync(join(root, "hooks"));
  mkdirSync(join(root, "dist"));
  writeFileSync(join(root, "dist", "hook.mjs"), hookSource);
  writeFileSync(join(root, "hooks", "hooks.json"), JSON.stringify(hooksJson));
  return root;
}

const echoHook = `
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  const input = JSON.parse(raw);
  const out = { root: process.env.CLAUDE_PLUGIN_ROOT, data: process.env.CLAUDE_PLUGIN_DATA, event: input.hook_event_name, cmd: input.tool_input?.command };
  if (input.tool_input?.command === "leak") process.stderr.write("${FAKE_KEY_ID}");
  process.stdout.write(JSON.stringify(out));
});`;

const preToolUse = (matcher: string): unknown => ({
  hooks: {
    PreToolUse: [
      {
        matcher,
        hooks: [
          {
            type: "command",
            command: "node",
            args: ["${CLAUDE_PLUGIN_ROOT}/dist/hook.mjs"],
            timeout: 10,
          },
        ],
      },
    ],
  },
});

describe("runPluginHooks", () => {
  it("runs exec-form hooks with plugin variables substituted and exported", async () => {
    const root = fakePlugin(echoHook, preToolUse("Bash"));
    const [result] = await runPluginHooks(bashPreToolUseInput(root, "ls"), { pluginRoot: root });
    expect(result?.exitCode).toBe(0);
    expect(result?.json).toMatchObject({ root, event: "PreToolUse", cmd: "ls" });
    expect(typeof result?.json?.["data"]).toBe("string");
  });

  it("skips hooks whose matcher does not match the tool", async () => {
    const root = fakePlugin(echoHook, preToolUse("Write|Edit"));
    expect(await runPluginHooks(bashPreToolUseInput(root, "ls"), { pluginRoot: root })).toEqual([]);
  });

  it("reports secret-like output", async () => {
    const root = fakePlugin(echoHook, preToolUse("Bash"));
    const [result] = await runPluginHooks(bashPreToolUseInput(root, "leak"), { pluginRoot: root });
    expect(result?.secretFindings.map((finding) => finding.name)).toEqual(["aws-access-key-id"]);
  });

  it("refuses shell-form hooks", async () => {
    const root = fakePlugin(echoHook, {
      hooks: { SessionStart: [{ hooks: [{ type: "command", command: "node dist/hook.mjs" }] }] },
    });
    await expect(runPluginHooks(sessionStartInput(root), { pluginRoot: root })).rejects.toThrow(
      /exec form/,
    );
  });

  it("enforces the timeout", async () => {
    const root = fakePlugin("setInterval(() => {}, 1000);", preToolUse("Bash"));
    const [result] = await runPluginHooks(bashPreToolUseInput(root, "ls"), {
      pluginRoot: root,
      timeoutMs: 500,
    });
    expect(result?.timedOut).toBe(true);
  });
});
