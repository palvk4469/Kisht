import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test files share one database; some queries (imports, promises) span
    // branches, so run files one at a time rather than in parallel.
    fileParallelism: false,
  },
});
