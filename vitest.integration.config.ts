import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/**/*.integration.test.ts",
      "tests/integration/**/*.test.ts",
    ],
    fileParallelism: false,
    exclude: [
      ...configDefaults.exclude,
      "**/{.next,out,build,coverage}/**",
      "**/{dumps,production-dumps,real-data}/**",
      "docs/db/**",
      "**/*.{csv,dump,sql}",
    ],
  },
});
