import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LOCAL_CONTEXT } from "@claude-code-aws/report-contract";
import { parseTemplate, type Template } from "@claude-code-aws/template-analysis";

import type { CliDeps } from "../src/lib/cli.js";

export const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "tests",
  "fixtures",
  "serverless",
);
export const TEMPLATES = join(FIXTURES, "templates");

export function template(name: string): Template {
  const parsed = parseTemplate(readFileSync(join(TEMPLATES, `${name}.template.json`), "utf8"));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.template;
}

export function inline(resources: Record<string, unknown>): Template {
  const parsed = parseTemplate({ Resources: resources });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.template;
}

export const NOW = new Date("2026-10-31T00:00:00Z");

export function deps(root: string, overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    root,
    context: () => LOCAL_CONTEXT,
    exclusions: () => ({ exclusions: [], warnings: [] }),
    now: NOW,
    ...overrides,
  };
}

export function policy(statements: unknown[]): Template {
  return inline({
    P: {
      Type: "AWS::IAM::ManagedPolicy",
      Properties: { PolicyDocument: { Version: "2012-10-17", Statement: statements } },
    },
  });
}
