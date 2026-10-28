import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      // A plugin with a mod names its vitest files *.spec.ts: `claude plugin test` runs every
      // *.test.ts in the plugin directory and would try to load them.
      "plugins/*/test/**/*.{test,spec}.ts",
      "packages/*/test/**/*.test.ts",
      "scripts/test/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["plugins/*/src/**", "packages/*/src/**", "scripts/lib/**"],
    },
  },
});
