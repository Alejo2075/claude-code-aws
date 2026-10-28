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
  ui: {
    invalidate: (event: "ui.render") => void;
    resolve: (e: RenderEvent) => {
      Box: (props: Record<string, unknown>) => unknown;
      Text: (props: Record<string, unknown>) => unknown;
    };
  };
}

export interface RenderEvent {
  surface: string;
  component: string;
  props: { hasSurvey: boolean; bodyColumns: number };
}
