import { runHook } from "../lib/hook-runtime.js";
import { currentProjectDir, refreshIfDue } from "../lib/runtime.js";

/** Budget for the identity check; the hook runs in the background, so the prompt never waits. */
const VERIFY_BUDGET_MS = 5000;
/** Claude Code does not enforce a timeout on background hooks, so this process ends itself. */
const HARD_LIMIT_MS = 9000;

setTimeout(() => process.exit(0), HARD_LIMIT_MS).unref();

// Silent by design: it prints nothing, because on this event printed text would reach the model.
// It only keeps the stored check from going stale in a long session. Any failure is ignored.
await runHook(async (input) => {
  try {
    await refreshIfDue(currentProjectDir(input.cwd), VERIFY_BUDGET_MS);
  } catch {
    // Advisory only.
  }
  return undefined;
});
