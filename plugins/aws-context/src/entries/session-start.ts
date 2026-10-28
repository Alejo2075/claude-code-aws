import { runHook } from "../lib/hook-runtime.js";
import { buildReport, renderSessionContext } from "../lib/report.js";
import { currentProjectDir, refreshAndStore } from "../lib/runtime.js";

/** Budget for the identity check; the hook timeout in hooks.json is larger. */
const VERIFY_BUDGET_MS = 5000;

// Advisory only: any failure degrades to "no context" and never blocks the session.
await runHook(async (input) => {
  try {
    const outcome = await refreshAndStore(currentProjectDir(input.cwd), VERIFY_BUDGET_MS);
    const report = buildReport(outcome.snapshot, outcome.config, new Date());
    return {
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        additionalContext: renderSessionContext(report),
      },
    };
  } catch {
    return undefined;
  }
});
