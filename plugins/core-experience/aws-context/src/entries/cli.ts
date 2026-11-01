import { currentProjectDir } from "../lib/runtime.js";
import { runCli } from "../lib/cli.js";

try {
  const result = await runCli(process.argv.slice(2), currentProjectDir(process.cwd()));
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  // Never print the error object: SDK errors can carry request details.
  process.stderr.write(
    `aws-context failed (${error instanceof Error ? error.name : "UnknownError"}).\n`,
  );
  process.exitCode = 1;
}
