import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { LOCAL_CONTEXT } from "@claude-code-aws/report-contract";
import { parseTemplate, type Template } from "@claude-code-aws/template-analysis";

import type { CliDeps } from "../src/lib/cli.js";
import type { DeployedApi } from "../src/lib/deployed.js";

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

export function fakeDeployed(
  body: string | Error,
  identity = { accountId: "123456789012", arn: "arn:aws:sts::123456789012:assumed-role/Dev/carol" },
) {
  const calls: string[] = [];
  const api: DeployedApi = {
    identity: () => Promise.resolve(identity),
    getTemplate: (stack) => {
      calls.push(`getTemplate:${stack}`);
      return body instanceof Error ? Promise.reject(body) : Promise.resolve(body);
    },
    close: () => {
      calls.push("close");
    },
  };
  return { api, calls };
}

export function deps(root: string, overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    root,
    env: { PATH: process.env["PATH"] },
    context: () => LOCAL_CONTEXT,
    contextEnvironment: () => null,
    sdkRegion: () => Promise.resolve("us-east-1"),
    fallbackRegion: null,
    deployedApi: () => fakeDeployed("{}").api,
    now: new Date("2026-10-31T00:00:00Z"),
    ...overrides,
  };
}
