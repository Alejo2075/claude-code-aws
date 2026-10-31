import { runCli } from "../lib/cli.js";

try {
  const root = process.env["CLAUDE_PROJECT_DIR"] || process.cwd();
  const result = await runCli(process.argv.slice(2), { root, env: process.env });
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  process.stderr.write(
    `aws-diagrams failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
  );
  process.exitCode = 1;
}
