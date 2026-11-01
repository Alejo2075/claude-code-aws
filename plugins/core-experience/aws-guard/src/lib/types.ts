/** What an operation does, from least to most consequential. `unknown` is treated as a change. */
export type OpClass = "read" | "local" | "write" | "delete" | "destructive" | "unknown";

export const CHANGING: ReadonlySet<OpClass> = new Set([
  "write",
  "delete",
  "destructive",
  "unknown",
]);

export interface Classification {
  class: OpClass;
  /** Stable machine-readable code for why: for example `AWS_VERB_DELETE`. */
  code: string;
}

/** One AWS-affecting command found in a tool call. */
export interface Invocation {
  /** `aws`, `cdk`, `sam`, `terraform`, ... or `mcp` for an MCP tool call. */
  tool: string;
  /** Arguments after the tool name, unquoted. */
  args: string[];
  /** Some arguments are not known (an expansion, or they come from standard input). */
  dynamic: boolean;
  /** Environment assignments that apply to this command (inline or exported earlier). */
  env: Record<string, string>;
  /** The profile chosen by `aws-vault exec <profile>`, if any. */
  vaultProfile: string | null;
}
