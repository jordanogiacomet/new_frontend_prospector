import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    maxWorkers: 2,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    exclude: [
      ...configDefaults.exclude,
      "**/{.next,out,build,coverage}/**",
      "**/{dumps,production-dumps,real-data}/**",
      "src/**/*.integration.test.{ts,tsx}",
      "tests/integration/**",
      "tests/contract/**",
      "docs/db/**",
      "**/*.{csv,dump,sql}",
    ],
  },
});
