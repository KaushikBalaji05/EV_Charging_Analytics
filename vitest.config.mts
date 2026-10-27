import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // 'server-only' throws outside Next's server bundle; stub it for unit tests.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // Integration tests share one database; some temporarily insert rows (e.g. an ongoing session),
    // so test files run one at a time to keep each other's exact-number assertions stable.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    // Load .env.local so integration tests can reach the database (skipped if DATABASE_URL is absent).
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
