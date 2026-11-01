// The mod must only read local files and draw. `claude plugin validate` lists every mods API call a
// hooks module makes, read statically from its source, so this test fails if a network, process,
// model, prompt, or tool call ever appears in the bundle.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundled = existsSync(join(pluginRoot, "dist", "register.js"));
const probe = spawnSync("claude", ["--version"], { encoding: "utf8" });
const hasClaude = probe.status === 0;

describe.runIf(bundled && hasClaude)("aws-ui mod surface", () => {
  const output = (): string => {
    const result = spawnSync("claude", ["plugin", "validate", pluginRoot], { encoding: "utf8" });
    expect(result.status).toBe(0);
    return `${result.stdout}\n${result.stderr}`;
  };
  const line = (text: string, label: string): string =>
    text.split("\n").find((entry) => entry.includes(`register.js ${label}`)) ?? "";

  it("handles only the events it needs", () => {
    expect(line(output(), "hooks:")).toMatch(
      /hooks: command\.run\{command=aws-report\}, ui\.render\{component=Pane, requestId=aws-report\}, session\.start, ui\.render\{component=SessionMode\}, ui\.render\{component=PromptHint\}$/,
    );
  });

  it("makes only local-file, timer, and drawing calls", () => {
    const calls = line(output(), "calls:");
    expect(calls).not.toBe("");
    for (const forbidden of [
      "$.http",
      "$.process",
      "$.model",
      "$.mcp",
      "$.prompt",
      "$.tool",
      "$.agent",
      "$.session.send",
      "$.session.messages",
      "$.fs.write",
      "$.settings",
      "$.ui.status",
      "$.ui.toast",
      "$.store",
      "$.env.set",
    ]) {
      expect(calls).not.toContain(forbidden);
    }
  });

  it("adds only the report pane: a command, a pane, and file reads of the one file you name", () => {
    const calls = line(output(), "calls:");
    for (const allowed of [
      "$.command.register",
      "$.ui.open",
      "$.ui.resolve",
      "$.fs.read",
      "$.fs.stat",
    ])
      expect(calls).toContain(allowed);
    expect(calls).not.toContain("$.command.run");
  });

  it("reads only the variables that locate Claude's config directory", () => {
    const reads = line(output(), "env reads:");
    expect(reads).toMatch(/CLAUDE_CONFIG_DIR, HOME, USERPROFILE$/);
    expect(line(output(), "env writes:")).toContain("nothing");
  });
});
