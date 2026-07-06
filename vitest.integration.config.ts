import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: [
      ...configDefaults.exclude,
      "**/{.next,out,build,coverage}/**",
      "**/{dumps,production-dumps,real-data}/**",
      "docs/db/**",
      "**/*.{csv,dump,sql}",
    ],
  },
});
