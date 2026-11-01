import type { Manifest } from "./manifest.js";
import type { ScanHit } from "./scan.js";

/** A cleanup plan as text. Nothing is deleted by this plugin; the commands are for a person to review and run. */
export function cleanupPlan(m: Manifest, region: string | null): string {
  const tag = `${m.cleanup.tagKey}=${m.cleanup.tagValue}`;
  const where =
    m.sandbox === null
      ? "No sandbox is set in the manifest, so there should be nothing deployed."
      : `Sandbox account ${m.sandbox.accountId}, region ${m.sandbox.region}`;
  const r = region ?? m.sandbox?.region ?? "<region>";
  const lines = [
    `Cleanup plan for "${m.name}" (a plan: nothing has been deleted)`,
    where,
    "",
    "1. Confirm what exists, read-only:",
    `   aws resourcegroupstaggingapi get-resources --tag-filters Key=${m.cleanup.tagKey},Values=${m.cleanup.tagValue} --region ${r}`,
    "2. Compare with the resources the manifest lists. Anything tagged but not listed is an orphan: find out who created it before touching it.",
    ...m.cleanup.resources.map((x) => `   - expected: ${x.type} ${x.name}`),
    "3. Protected-resource check, before any deletion:",
    "   - the account id matches the sandbox above, and aws-context shows it as non-production",
    `   - every resource to delete carries ${tag}; delete nothing that does not`,
    "   - stateful resources (tables, buckets, streams) are listed to the owner first, with their item or object counts",
    "4. Remove the prototype with the same tool that created it (for example `cdk destroy` of the prototype stack). If a deploy plan exists, aws-deploy owns the execution and its approval.",
    "5. Verify: re-run step 1 and expect no results, then check the account bill for the prototype's tag after a day.",
    "",
    "No deletion happens on a timer and none happens without a person approving the exact list.",
  ];
  return lines.join("\n");
}

/** What it would take to move a prototype toward production. Does not copy anything. */
export function promotionPlan(m: Manifest, hits: readonly ScanHit[], decided: boolean): string {
  const blockers = hits.filter((h) => h.kind === "secret" || h.kind === "wildcard-permission");
  const shortcuts = hits.filter((h) => h.kind === "shortcut");
  const fixtures = hits.filter((h) => h.kind === "fixture");
  const lines = [
    `# Promotion plan: ${m.name}`,
    "",
    `Question: ${m.question}`,
    `Decision recorded: ${m.decision === "" ? "none yet" : m.decision}`,
    "",
    decided
      ? ""
      : "> Not ready: record a decision in the manifest first (`decision:`), based on the comparison.",
    "",
    "## Blockers found in the prototype",
    ...(blockers.length === 0
      ? ["- None found by the scan (the scan is a check, not proof of safety)."]
      : blockers.map((h) => `- ${h.file}: ${h.detail}`)),
    "",
    "## Shortcuts to remove",
    ...(shortcuts.length === 0
      ? ["- None marked."]
      : shortcuts.map((h) => `- ${h.file}: ${h.detail}`)),
    "",
    "## Do not copy",
    ...(fixtures.length === 0
      ? ["- No fixtures."]
      : fixtures.map((h) => `- ${h.file}: ${h.detail}`)),
    "",
    "## Steps to production, each owned by the plugin that owns it",
    "1. Architecture: record the decision as an ADR (`/aws-architect:decide`, `adr`) with the comparison attached.",
    "2. Infrastructure: scaffold or write the stacks as maintained CDK (`/aws-infrastructure:scaffold`), with removal policies and tags.",
    "3. Tests: write the real suite (`/aws-testing`), including the failure cases the prototype only simulated.",
    "4. Review: run `/aws-well-architected:review` and `/aws-security:review` on the synthesized app.",
    "5. Deploy: only through `/aws-deploy` with its approval flow; the prototype's sandbox is not the target.",
    "",
    "## Assumptions to re-check",
    ...(m.assumptions.length === 0 ? ["- None recorded."] : m.assumptions.map((a) => `- ${a}`)),
  ];
  return lines.join("\n");
}

/** A plan for a human or for aws-deploy to execute in a sandbox. This plugin never deploys. */
export function sandboxPlan(m: Manifest): string | { error: string } {
  if (m.sandbox === null)
    return {
      error:
        "The manifest has no sandbox (accountId and region). A prototype runs on AWS only in a dedicated sandbox account.",
    };
  const lines = [
    `Sandbox deployment plan for "${m.name}" (a plan: nothing was deployed)`,
    `Target: account ${m.sandbox.accountId}, region ${m.sandbox.region}`,
    `Budget: up to ${m.budget.maxUsd} USD and ${m.budget.maxHours} hours. Usage: ${m.usage.requestsPerRun} requests per run, ${m.usage.runs} runs.`,
    `Blast radius: ${m.blastRadius}`,
    `Ownership tag on every resource: ${m.cleanup.tagKey}=${m.cleanup.tagValue}`,
    "",
    "Permissions the prototype needs:",
    ...m.permissions.map((p) => `  - ${p}`),
    "",
    "Before anything runs:",
    "  1. aws-context shows this exact account and region as verified, and as non-production.",
    "  2. The person who owns the account approves the budget above.",
    "  3. Use /aws-deploy plan and deploy from a synthesized app; do not run cdk deploy from here. aws-guard asks for approval on the commands.",
    "  4. Keep the cleanup plan (/aws-prototyping:cleanup-plan) next to the deployment.",
    "",
    "Without aws-deploy installed: run the same steps by hand with the AWS CLI or CDK in that account, after reading the plan.",
  ];
  return lines.join("\n");
}
