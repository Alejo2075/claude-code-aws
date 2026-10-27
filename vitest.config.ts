import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "plugins/*/test/**/*.test.ts",
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
