// Optional SVG/PNG export through the Mermaid CLI, when it is installed in the project or on PATH.
// The Mermaid source is always produced first and never depends on this step.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findOnPath,
  findPackageBin,
  type RunOptions,
  type RunResult,
  runTool,
  scrubbedEnv,
} from "@claude-code-aws/tool-runner";

export type Runner = (options: RunOptions) => Promise<RunResult>;

export interface RenderResult {
  ok: boolean;
  data?: Buffer;
  reason?: string;
}

export function rendererCommand(
  root: string,
  env: Record<string, string | undefined>,
): { command: string; prefix: string[] } | null {
  const entry = findPackageBin(root, "@mermaid-js/mermaid-cli", "mmdc");
  if (entry !== null) return { command: process.execPath, prefix: [entry] };
  const onPath = findOnPath("mmdc", env["PATH"]);
  return onPath === null ? null : { command: onPath, prefix: [] };
}

export async function renderImage(
  source: string,
  format: "svg" | "png",
  root: string,
  env: Record<string, string | undefined>,
  run: Runner = runTool,
): Promise<RenderResult> {
  const renderer = rendererCommand(root, env);
  if (renderer === null)
    return {
      ok: false,
      reason:
        "No Mermaid renderer found. Install @mermaid-js/mermaid-cli in the project (or put mmdc on PATH) for SVG/PNG; the Mermaid source was still written.",
    };
  const dir = mkdtempSync(join(tmpdir(), "aws-diagrams-"));
  try {
    const input = join(dir, "in.mmd");
    const output = join(dir, `out.${format}`);
    writeFileSync(input, source);
    const result = await run({
      command: renderer.command,
      args: [...renderer.prefix, "-i", input, "-o", output],
      root: dir,
      env: scrubbedEnv(env),
      timeoutMs: 60_000,
      maxOutputBytes: 20_000,
    });
    if (result.spawnError !== null || result.exitCode !== 0)
      return { ok: false, reason: "The renderer failed; the Mermaid source was still written." };
    return { ok: true, data: readFileSync(output) };
  } catch {
    return {
      ok: false,
      reason: "The renderer produced no output; the Mermaid source was still written.",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
