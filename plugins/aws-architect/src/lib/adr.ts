// Architecture Decision Records in the MADR layout. Nothing is written without --write, and an
// existing record is never overwritten.
import { mkdirSync, openSync, closeSync, readdirSync, writeSync } from "node:fs";
import { join } from "node:path";

import { sanitizeText } from "@claude-code-aws/safe-output";

export interface AdrInput {
  title: string;
  status: "proposed" | "accepted" | "superseded";
  context: string;
  decision: string;
  consequences: string;
  options: string[];
}

export const ADR_DIR = "docs/adr";
const MAX = 4000;

const clean = (text: string, max = MAX): string => sanitizeText(text, true).trim().slice(0, max);

export function slugOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug === "" ? "decision" : slug;
}

export function nextNumber(existing: readonly string[]): number {
  let highest = 0;
  for (const name of existing) {
    const match = /^(\d{4})-/.exec(name);
    if (match !== null) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

export function renderAdr(input: AdrInput, number: number, date: string): string {
  const options = input.options.map((o) => clean(o, 200)).filter((o) => o !== "");
  return [
    `# ${String(number).padStart(4, "0")}. ${clean(input.title, 120)}`,
    "",
    `- Status: ${input.status}`,
    `- Date: ${date}`,
    "",
    "## Context",
    "",
    clean(input.context) || "_Not stated._",
    "",
    ...(options.length > 0
      ? ["## Options considered", "", ...options.map((o) => `- ${o}`), ""]
      : []),
    "## Decision",
    "",
    clean(input.decision) || "_Not stated._",
    "",
    "## Consequences",
    "",
    clean(input.consequences) || "_Not stated._",
    "",
  ].join("\n");
}

export type WriteResult = { ok: true; file: string } | { ok: false; error: string };

/** Writes the record under docs/adr with an exclusive create, so an existing file is never touched. */
export function writeAdr(root: string, input: AdrInput, date: string): WriteResult {
  const dir = join(root, ADR_DIR);
  mkdirSync(dir, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const number = nextNumber(readdirSync(dir)) + attempt;
    const name = `${String(number).padStart(4, "0")}-${slugOf(input.title)}.md`;
    try {
      const fd = openSync(join(dir, name), "wx");
      try {
        writeSync(fd, renderAdr(input, number, date));
      } finally {
        closeSync(fd);
      }
      return { ok: true, file: `${ADR_DIR}/${name}` };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST")
        return { ok: false, error: "the record could not be written" };
    }
  }
  return { ok: false, error: "no free record number was found" };
}
