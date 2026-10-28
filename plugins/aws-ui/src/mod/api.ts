// The slice of the mods API this module uses, typed locally so the workspace type-checks without
// Claude Code's generated declarations. Claude Code writes the full, version-exact declarations to
// `.claude-plugin/types/` when it loads a mod; `claude plugin validate` checks real usage.
export interface ModApi {
  env: { get: (name: string) => Promise<string | undefined> };
  fs: {
    stat: (path: string) => Promise<{ size: number; mtimeMs: number }>;
    read: (path: string) => Promise<string>;
  };
  session: { root: () => Promise<string> };
  clock: {
    now: () => Promise<number>;
    every: (ms: number, fn: () => void) => { cancel: () => void };
  };
  ui: { invalidate: (event: "ui.render") => void };
}

/** The `SessionMode` render site: the dim labels at the right of the prompt footer. */
export interface ModeEvent {
  surface: string;
  component: "SessionMode";
  viewport?: { columns: number };
  props: { modes: readonly string[] };
}

/** The `PromptHint` render site: the dim hint line under the prompt. Only observed. */
export interface HintEvent {
  surface: string;
  component: "PromptHint";
  props: { hint: string };
}
