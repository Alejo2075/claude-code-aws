// Run from a plugin directory via its package.json "build" script.
import { relative } from "node:path";

import { buildPlugin } from "./lib/build.js";

const outputs = await buildPlugin(process.cwd());
for (const output of outputs) console.log(`built ${relative(process.cwd(), output)}`);
