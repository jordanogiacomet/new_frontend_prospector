import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/contract/**/*.test.ts"],
    exclude: [
      ...configDefaults.exclude,
      "**/{.next,out,build,coverage}/**",
      "**/{dumps,production-dumps,real-data}/**",
      "docs/db/**",
      "**/*.{csv,dump,sql}",
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
