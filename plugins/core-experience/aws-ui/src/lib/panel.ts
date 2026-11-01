// What the report pane shows. Pure functions over a parsed JSON document, so they are tested without
// Claude Code. The document is untrusted: it comes from a file that a plugin or a person wrote.
import { maskAccount } from "@claude-code-aws/context-contract";
import { sanitizeText } from "@claude-code-aws/safe-output";

export type Tone = "plain" | "dim" | "bold" | "red" | "yellow" | "green";
export interface Line {
  text: string;
  tone: Tone;
}
export interface Panel {
  title: string;
  lines: Line[];
}

export const MAX_FILE_BYTES = 1_000_000;
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 300): string =>
  sanitizeText(typeof v === "string" || typeof v === "number" ? String(v) : "").slice(0, max);
const SEVERITY: Record<string, Tone> = {
  critical: "red",
  high: "red",
  medium: "yellow",
  low: "plain",
  info: "dim",
};
const STATUS_TONE: Record<string, Tone> = {
  gap: "red",
  partial: "yellow",
  unknown: "dim",
  evidenced: "green",
};

function reportLines(doc: Record<string, unknown>): Panel {
  const lines: Line[] = [];
  const ctx = isObj(doc["context"]) ? doc["context"] : {};
  const account =
    typeof ctx["accountId"] === "string"
      ? maskAccount(ctx["accountId"])
      : "no AWS account involved";
  lines.push({
    text: `${str(doc["plugin"], 40)} · ${str(doc["mode"], 20)} · ${account}${ctx["identityVerified"] === true ? " · identity verified" : ""}`,
    tone: "dim",
  });
  lines.push({ text: str(doc["summary"], 400), tone: "bold" });
  const findings = Array.isArray(doc["findings"]) ? doc["findings"].filter(isObj) : [];
  for (const f of findings.slice(0, 200)) {
    const sev = str(f["severity"], 10);
    lines.push({
      text: `[${sev.toUpperCase()}] ${str(f["title"], 200)}${f["status"] === "hypothesis" ? " (hypothesis)" : ""}`,
      tone: SEVERITY[sev] ?? "plain",
    });
    const resource =
      Array.isArray(f["affectedResources"]) && typeof f["affectedResources"][0] === "string"
        ? str(f["affectedResources"][0], 120)
        : "";
    if (resource !== "")
      lines.push({ text: `   ${resource}  ${str(f["ruleId"], 60)}`, tone: "dim" });
  }
  if (findings.length === 0) lines.push({ text: "No findings.", tone: "dim" });
  for (const l of (Array.isArray(doc["limitations"]) ? doc["limitations"] : []).slice(0, 6))
    lines.push({ text: `- ${str(l, 300)}`, tone: "dim" });
  return { title: `Report: ${str(doc["plugin"], 30) || "analysis"}`, lines };
}

function reviewLines(doc: Record<string, unknown>): Panel {
  const lines: Line[] = [{ text: str(doc["disclaimer"], 400), tone: "dim" }];
  const scope = isObj(doc["scope"]) ? doc["scope"] : {};
  lines.push({
    text: `${str(scope["name"], 80)} · ${str(scope["criticality"], 20)} · ${str(scope["environment"], 40)}`,
    tone: "bold",
  });
  const cov = isObj(doc["coverage"]) ? doc["coverage"] : {};
  lines.push({
    text: `Evidence for ${str(cov["withEvidence"], 5)} of ${str(cov["questions"], 5)} questions; ${str(cov["verified"], 5)} verified from the account`,
    tone: "plain",
  });
  const pillars = isObj(doc["byPillar"]) ? doc["byPillar"] : {};
  for (const [name, counts] of Object.entries(pillars).slice(0, 8)) {
    if (!isObj(counts)) continue;
    lines.push({
      text: `${name.padEnd(24)} evidenced ${str(counts["evidenced"], 3)}  partly ${str(counts["partial"], 3)}  gap ${str(counts["gap"], 3)}  no evidence ${str(counts["unknown"], 3)}`,
      tone: "plain",
    });
  }
  const backlog = Array.isArray(doc["backlog"]) ? doc["backlog"].filter(isObj) : [];
  if (backlog.length > 0) lines.push({ text: "Backlog", tone: "bold" });
  for (const b of backlog.slice(0, 50))
    lines.push({
      text: `${str(b["priority"], 3)} ${str(b["questionId"], 40)} (${str(b["status"], 10)}): ${str(b["action"], 200)}`,
      tone: STATUS_TONE[str(b["status"], 10)] ?? "plain",
    });
  const missing = Array.isArray(doc["missing"]) ? doc["missing"].length : 0;
  if (missing > 0)
    lines.push({ text: `${missing} question(s) have no evidence: unknown, not met`, tone: "dim" });
  return { title: "Well-Architected style review", lines };
}

function diagramLines(doc: Record<string, unknown>): Panel {
  const lines: Line[] = [
    { text: `${str(doc["title"], 80)} (${str(doc["diagramType"], 30)})`, tone: "bold" },
    { text: str(doc["legend"], 400), tone: "dim" },
  ];
  for (const l of str(doc["mermaid"], 20_000).split("\n").slice(0, 200))
    lines.push({ text: l, tone: "plain" });
  for (const p of (Array.isArray(doc["provenance"]) ? doc["provenance"] : []).slice(0, 5))
    lines.push({ text: `Source: ${str(p, 200)}`, tone: "dim" });
  return { title: "Diagram (Mermaid source)", lines };
}

export function panelFor(text: string | null): Panel {
  if (text === null)
    return {
      title: "Report",
      lines: [{ text: "The file could not be read, or is larger than 1 MB.", tone: "red" }],
    };
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { title: "Report", lines: [{ text: "The file is not valid JSON.", tone: "red" }] };
  }
  if (isObj(doc) && doc["kind"] === "WellArchitectedReview") return reviewLines(doc);
  if (isObj(doc) && doc["kind"] === "DiagramArtifact") return diagramLines(doc);
  if (
    isObj(doc) &&
    doc["schemaVersion"] === "1" &&
    Array.isArray(doc["findings"]) &&
    typeof doc["plugin"] === "string"
  )
    return reportLines(doc);
  return {
    title: "Report",
    lines: [
      {
        text: "This is not a report this panel understands (an analysis report, a Well-Architected review, or a diagram artifact, as JSON).",
        tone: "yellow",
      },
    ],
  };
}

/** Fits lines to the pane: cut to the width, and keep room for a note about what was left out. */
export function fit(lines: readonly Line[], columns: number, rows: number): Line[] {
  const width = Math.max(20, columns);
  const room = Math.max(3, rows - 2);
  const cut = lines.map((l) =>
    l.text.length > width ? { ...l, text: `${l.text.slice(0, width - 1)}…` } : l,
  );
  if (cut.length <= room) return cut;
  return [
    ...cut.slice(0, room - 1),
    {
      text: `… ${cut.length - room + 1} more line(s); use --json in the plugin command for all`,
      tone: "dim",
    },
  ];
}
