// The report pane. `/aws-report <file>` opens a pane that shows a report the plugins wrote as JSON
// (an analysis report, a Well-Architected review, or a diagram artifact). The module only reads the
// file you name, through $.fs, size-limited, and draws it. It calls nothing else.
import { fit, MAX_FILE_BYTES, panelFor, type Panel, type Tone } from "../lib/panel.js";

export interface PaneApi {
  command: { register: (c: { name: string; description: string }) => Promise<void> };
  fs: { stat: (p: string) => Promise<{ size: number }>; read: (p: string) => Promise<string> };
  ui: {
    open: (o: { id: string; title: string }) => Promise<unknown>;
    invalidate: (event: "ui.render") => void;
    resolve: (e: unknown) => { Box: unknown; Text: unknown };
  };
}
interface PaneEvent {
  component: "Pane";
  requestId: string;
  viewport?: { columns: number; rows: number };
  props?: { bodyColumns?: number };
}
declare const h: (
  type: unknown,
  props: Record<string, unknown> | null,
  ...children: unknown[]
) => unknown;

let shown: Panel | null = null;

const TEXT_PROPS: Record<Tone, Record<string, unknown>> = {
  plain: {},
  dim: { dimColor: true },
  bold: { bold: true },
  red: { color: "red" },
  yellow: { color: "yellow" },
  green: { color: "green" },
};

async function load($: PaneApi, path: string): Promise<string | null> {
  try {
    const info = await $.fs.stat(path);
    if (info.size > MAX_FILE_BYTES) return null;
    return await $.fs.read(path);
  } catch {
    return null;
  }
}

/** Called from the module's one `session.start` hook (a second one without a matcher is refused). */
export async function registerReportCommand($: PaneApi): Promise<void> {
  await $.command.register({
    name: "aws-report",
    description: "Show an AWS plugin report (JSON) in a pane: /aws-report <file>",
  });
}

export function registerPanel(on: (...args: unknown[]) => unknown): void {
  on("command.run", { command: "aws-report" }, async ($: PaneApi, e: { args: string }) => {
    const path = e.args.trim();
    if (path === "")
      return {
        text: "Usage: /aws-report <path to a JSON report>. Write one with a plugin command and --json, for example /aws-security:audit --json.",
      };
    shown = panelFor(await load($, path));
    await $.ui.open({ id: "aws-report", title: shown.title });
    $.ui.invalidate("ui.render");
    return { text: `${shown.title} opened. The file was only read; nothing was changed.` };
  });

  on("ui.render", { component: "Pane", requestId: "aws-report" }, ($: PaneApi, e: PaneEvent) => {
    const { Box, Text } = $.ui.resolve(e);
    const panel = shown ?? {
      title: "Report",
      lines: [{ text: "Nothing to show yet: /aws-report <file>", tone: "dim" as const }],
    };
    const lines = fit(
      panel.lines,
      e.props?.bodyColumns ?? e.viewport?.columns ?? 80,
      e.viewport?.rows ?? 24,
    );
    return h(
      Box,
      { flexDirection: "column" },
      ...lines.map((l) => h(Text, TEXT_PROPS[l.tone], l.text)),
    );
  });
}
