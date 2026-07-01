import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.{ts,tsx}",
      "tests/**/*.test.{ts,tsx}",
    ],
    exclude: [
      ...configDefaults.exclude,
      "**/{.next,out,build,coverage}/**",
      "**/{dumps,production-dumps,real-data}/**",
      "docs/db/**",
      "**/*.{csv,dump,sql}",
    ],
  },
});
