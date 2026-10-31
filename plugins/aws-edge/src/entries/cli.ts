import { runEntry } from "@claude-code-aws/plugin-kit";

import { runCli } from "../lib/cli.js";

await runEntry("aws-edge", runCli);
