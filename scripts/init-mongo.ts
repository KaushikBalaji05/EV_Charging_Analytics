import fs from "node:fs";
import path from "node:path";

// Auto-load .env.local if present
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

import { initMongoTelemetry, closeMongoConnection } from "../src/lib/db/mongodb";

async function main() {
  console.log("[mongo-init] Initializing MongoDB telemetry collection and indexes...");
  const result = await initMongoTelemetry();
  console.log(`[mongo-init] Result: ${result.message}`);
  await closeMongoConnection();
}

main().catch((err) => {
  console.error("[mongo-init] Initialization failed:", err);
  process.exit(1);
});
