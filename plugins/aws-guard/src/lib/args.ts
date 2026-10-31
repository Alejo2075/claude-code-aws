/** Splits CLI arguments into positionals and options. Option values are not interpreted. */
export interface Parsed {
  positionals: string[];
  options: Map<string, string | true>;
}

/** Options that take a value in the AWS CLI's global set; others are treated as flags. */
const AWS_VALUE_OPTIONS = new Set([
  "profile",
  "region",
  "output",
  "endpoint-url",
  "query",
  "ca-bundle",
  "color",
  "cli-read-timeout",
  "cli-connect-timeout",
  "cli-binary-format",
  "cli-input-json",
  "cli-input-yaml",
  "generate-cli-skeleton",
]);

export function parseArgs(
  args: readonly string[],
  valueOptions: ReadonlySet<string> = AWS_VALUE_OPTIONS,
): Parsed {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";
    if (arg === "--") {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith("--") && arg.length > 2) {
      const eq = arg.indexOf("=");
      if (eq > 0) {
        options.set(arg.slice(2, eq), arg.slice(eq + 1));
      } else {
        const name = arg.slice(2);
        const next = args[i + 1];
        if (valueOptions.has(name) && next !== undefined) {
          options.set(name, next);
          i += 1;
        } else options.set(name, true);
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      const name = arg.slice(1);
      const next = args[i + 1];
      if (valueOptions.has(name) && next !== undefined) {
        options.set(name, next);
        i += 1;
      } else options.set(name, true);
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, options };
}

export function optionValue(parsed: Parsed, name: string): string | null {
  const value = parsed.options.get(name);
  return typeof value === "string" ? value : null;
}
