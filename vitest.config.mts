import { defineConfig, loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // 'server-only' throws outside Next's server bundle; stub it for unit tests.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Load .env.local so integration tests can reach the database (skipped if DATABASE_URL is absent).
    env: loadEnv(mode, process.cwd(), ""),
  },
}));
