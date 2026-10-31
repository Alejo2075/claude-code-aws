// Visible, scoped, expiring exclusions. The project file is repository content: it can never hide a
// high or critical finding. Only the user's own file can, and every report lists what was hidden.
import type { Finding, Severity } from "@claude-code-aws/report-contract";

export interface Exclusion {
  ruleId: string;
  /** A logical id, or `*` for every resource. */
  logicalId: string;
  reason: string;
  /** ISO date. Required for anything above low severity. */
  expires: string | null;
  source: "user" | "project";
}

const ORDER: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export interface ParsedExclusions {
  exclusions: Exclusion[];
  warnings: string[];
}

export function parseExclusions(text: string, source: "user" | "project"): ParsedExclusions {
  const result: ParsedExclusions = { exclusions: [], warnings: [] };
  const warn = (message: string): void => {
    result.warnings.push(`${source} config: ${message}`);
  };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    warn("is not valid JSON and was ignored");
    return result;
  }
  if (!isRecord(value) || value["version"] !== 1 || !Array.isArray(value["exclusions"])) {
    warn("must be an object with version 1 and an exclusions list; ignored");
    return result;
  }
  for (const entry of (value["exclusions"] as unknown[]).slice(0, 200)) {
    if (
      !isRecord(entry) ||
      typeof entry["ruleId"] !== "string" ||
      typeof entry["reason"] !== "string" ||
      entry["reason"].trim() === ""
    ) {
      warn("an exclusion needs a ruleId and a reason; ignored");
      continue;
    }
    const expires =
      typeof entry["expires"] === "string" && !Number.isNaN(Date.parse(entry["expires"]))
        ? entry["expires"]
        : null;
    if (entry["expires"] !== undefined && expires === null) {
      warn(`exclusion for ${entry["ruleId"]} has an invalid expires date; ignored`);
      continue;
    }
    result.exclusions.push({
      ruleId: entry["ruleId"],
      logicalId: typeof entry["logicalId"] === "string" ? entry["logicalId"] : "*",
      reason: entry["reason"].slice(0, 300),
      expires,
      source,
    });
  }
  return result;
}

export interface Partitioned {
  kept: Finding[];
  suppressed: Array<{ finding: Finding; exclusion: Exclusion }>;
  /** Exclusions that were not honored, and why. */
  notes: string[];
}

/** Splits findings into those kept and those hidden by a valid exclusion. */
export function applyExclusions(
  findings: readonly Finding[],
  exclusions: readonly Exclusion[],
  now: Date,
): Partitioned {
  const out: Partitioned = { kept: [], suppressed: [], notes: [] };
  const refused = new Set<string>();
  for (const finding of findings) {
    const resource = finding.affectedResources?.[0] ?? "*";
    const match = exclusions.find(
      (exclusion) =>
        exclusion.ruleId === finding.ruleId &&
        (exclusion.logicalId === "*" || exclusion.logicalId === resource),
    );
    if (match === undefined) {
      out.kept.push(finding);
      continue;
    }
    const expired = match.expires !== null && Date.parse(match.expires) <= now.getTime();
    const needsExpiry = ORDER[finding.severity] > ORDER.low && match.expires === null;
    const projectHidingSerious =
      match.source === "project" && ORDER[finding.severity] >= ORDER.high;
    const why = expired
      ? "has expired"
      : needsExpiry
        ? "has no expiry (required above low severity)"
        : projectHidingSerious
          ? "is in the project file, which cannot hide high or critical findings"
          : null;
    if (why !== null) {
      out.kept.push(finding);
      refused.add(
        `The exclusion for ${match.ruleId} (${match.logicalId}) ${why}, so the finding is shown.`,
      );
    } else {
      out.suppressed.push({ finding, exclusion: match });
    }
  }
  out.notes.push(...refused);
  return out;
}
