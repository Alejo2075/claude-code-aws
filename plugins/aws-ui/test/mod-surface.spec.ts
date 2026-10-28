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

  it("handles only the two events it needs", () => {
    expect(line(output(), "hooks:")).toMatch(
      /hooks: session\.start, ui\.render\{component=SessionMode\}$/,
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
      "$.ui.resolve",
      "$.ui.open",
      "$.ui.status",
      "$.ui.toast",
      "$.store",
      "$.env.set",
    ]) {
      expect(calls).not.toContain(forbidden);
    }
  });

  it("reads only the variables that locate Claude's config directory", () => {
    const reads = line(output(), "env reads:");
    expect(reads).toMatch(/CLAUDE_CONFIG_DIR, HOME, USERPROFILE$/);
    expect(line(output(), "env writes:")).toContain("nothing");
  });
});
