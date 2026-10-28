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
