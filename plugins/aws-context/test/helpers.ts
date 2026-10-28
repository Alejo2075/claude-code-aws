import {
  type EffectiveConfig,
  type EnvReader,
  mergeConfig,
  parseConfig,
} from "@claude-code-aws/context-contract";

import type { RefreshDeps } from "../src/lib/refresh.js";
import type { Identity } from "../src/lib/sts.js";

/** Documentation-style placeholders, not real accounts. */
export const ACCOUNT = "123456789012";
export const OTHER_ACCOUNT = "210987654321";
export const ARN = `arn:aws:sts::${ACCOUNT}:assumed-role/Developer/session`;
export const NOW = new Date("2026-01-01T12:00:00.000Z");

export function envOf(values: Record<string, string>): EnvReader {
  return (name) => values[name];
}

export function configOf(user?: object, project?: object): EffectiveConfig {
  return mergeConfig(
    user ? parseConfig(JSON.stringify({ version: 1, ...user }), "user") : undefined,
    project ? parseConfig(JSON.stringify({ version: 1, ...project }), "project") : undefined,
  );
}

export function failure(name: string, message = "failure", code?: string): Error {
  const error = new Error(message);
  error.name = name;
  if (code !== undefined) Object.assign(error, { code });
  return error;
}

export function deps(overrides: Partial<RefreshDeps> = {}): RefreshDeps {
  return {
    env: envOf({ AWS_PROFILE: "dev" }),
    projectDir: "/work/project",
    now: NOW,
    config: configOf(),
    prior: null,
    resolveSdkRegion: () => Promise.resolve("us-east-1"),
    verify: (): Promise<Identity> => Promise.resolve({ accountId: ACCOUNT, arn: ARN }),
    ...overrides,
  };
}
