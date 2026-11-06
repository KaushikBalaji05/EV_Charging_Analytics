#!/usr/bin/env node
/**
 * EV Charging Demand & Grid Load Analytics
 * Live Database Operations Terminal Watcher
 *
 * Real-time terminal dashboard showing live PostgreSQL transactions and
 * MongoDB incoming telemetry records as they are committed to the databases.
 */

import fs from "node:fs";
import path from "node:path";
import { MongoClient } from "mongodb";
import { Pool } from "pg";

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

const PG_HOST = process.env.PGHOST || "127.0.0.1";
const PG_PORT = parseInt(process.env.PGPORT || "5432", 10);
const PG_DATABASE = process.env.PGDATABASE || "ev_charging_analytics";
const PG_USER = process.env.PGUSER || "yaswanth";
const PG_PASSWORD = process.env.PGPASSWORD || "";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "ev_charging_analytics";

// ANSI Color Helpers
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  bgCyan: "\x1b[46;30m",
  bgGreen: "\x1b[42;30m",
  bgBlue: "\x1b[44;30m",
};

async function main() {
  const pgPool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DATABASE,
    user: PG_USER,
    password: PG_PASSWORD,
    max: 2,
    connectionTimeoutMillis: 3000,
  });

  const mongoClient = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 3000,
  });

  await mongoClient.connect();
  const mongoDb = mongoClient.db(MONGODB_DB_NAME);
  const telemetryCol = mongoDb.collection("grid_telemetry");

  let prevMongoCount: number | null = null;
  let prevPgSessions: number | null = null;

  async function render() {
    try {
      const now = new Date();
      const timeStr = now.toLocaleTimeString();

      // Query MongoDB
      const mongoCount = await telemetryCol.countDocuments();
      const recentTelemetry = await telemetryCol
        .find()
        .sort({ recorded_at: -1 })
        .limit(6)
        .toArray();

      const mongoDiff =
        prevMongoCount !== null ? mongoCount - prevMongoCount : 0;
      prevMongoCount = mongoCount;

      // Query PostgreSQL
      const pgCountsRes = await pgPool.query(`
        SELECT 
          (SELECT COUNT(*) FROM charging_station) AS stations,
          (SELECT COUNT(*) FROM charger) AS chargers,
          (SELECT COUNT(*) FROM charging_session) AS sessions,
          (SELECT COUNT(*) FROM ev) AS evs,
          (SELECT COUNT(*) FROM admin_activity_log) AS audit_logs
      `);
      const counts = pgCountsRes.rows[0];

      const recentSessionsRes = await pgPool.query(`
        SELECT 
          session_id,
          station_id,
          station_name,
          charger_id,
          registration_no,
          energy_kwh,
          cost,
          is_ongoing,
          start_time
        FROM v_session_details
        ORDER BY session_id DESC
        LIMIT 4
      `);

      const recentAuditRes = await pgPool.query(`
        SELECT a.action, a.entity_type, a.entity_id, a.entity_name, u.email AS admin_email, a.created_at
        FROM admin_activity_log a
        LEFT JOIN app_user u ON a.user_id = u.user_id
        ORDER BY a.log_id DESC
        LIMIT 2
      `);

      const currentSessions = parseInt(counts.sessions, 10);
      const sessionDiff =
        prevPgSessions !== null ? currentSessions - prevPgSessions : 0;
      prevPgSessions = currentSessions;

      // Clear screen
      process.stdout.write("\x1Bc");

      console.log(
        `${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════════════════════════════════╗${C.reset}`,
      );
      console.log(
        `${C.bold}${C.cyan}║             EV CHARGING ANALYTICS — LIVE DATABASE OPERATIONS MONITOR                 ║${C.reset}`,
      );
      console.log(
        `${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════════════════════════════════╝${C.reset}`,
      );
      console.log(
        `  ${C.dim}Time: ${timeStr} | Host: localhost | Refresh Rate: 2.0s | Press Ctrl+C to Stop${C.reset}\n`,
      );

      // Section 1: MongoDB
      const mongoGrowthTag =
        mongoDiff > 0
          ? `${C.green}+${mongoDiff} new records since last tick${C.reset}`
          : `${C.dim}streaming active (+20 docs / 5s)${C.reset}`;

      console.log(
        `${C.bold}${C.green}🍃 MONGODB: LIVE ELECTRICAL TELEMETRY STREAM${C.reset}  ${C.dim}[Collection: ${MONGODB_DB_NAME}.grid_telemetry]${C.reset}`,
      );
      console.log(
        `   Total Telemetry Documents: ${C.bold}${C.yellow}${mongoCount.toLocaleString()}${C.reset}  (${mongoGrowthTag})`,
      );
      console.log(`   ${C.bold}Latest Incoming Telemetry Sensor Readings:${C.reset}`);

      for (const t of recentTelemetry) {
        const tDate = new Date(t.recorded_at);
        const tTime = tDate.toLocaleTimeString();
        const overloadTag = t.metadata?.is_overloaded
          ? `${C.red}${C.bold} ⚠️ OVERLOAD${C.reset}`
          : `${C.green} OK${C.reset}`;
        const stName = (t.metadata?.station_name || `Station #${t.station_id}`).padEnd(26);
        const pwr = `${t.power_kw} kW`.padStart(9);
        const load = `${t.grid_load_kw} kW`.padStart(9);
        const volt = `${t.voltage_v}V`.padStart(7);
        const freq = `${t.frequency_hz}Hz`.padStart(9);

        console.log(
          `   ├─ [${C.dim}${tTime}${C.reset}] St#${String(t.station_id).padStart(2)} ${C.cyan}${stName}${C.reset} | Pwr:${C.bold}${pwr}${C.reset} | GridLoad:${C.yellow}${load}${C.reset} | ${volt} | ${freq} |${overloadTag}`,
        );
      }
      console.log();

      // Section 2: PostgreSQL
      const sessionGrowthTag =
        sessionDiff > 0
          ? `${C.green}+${sessionDiff} new session added!${C.reset}`
          : `${C.dim}ready for transactional inserts${C.reset}`;

      console.log(
        `${C.bold}${C.blue}🐘 POSTGRESQL: RELATIONAL ENGINE & TRANSACTION LOG${C.reset}  ${C.dim}[Database: ${PG_DATABASE}]${C.reset}`,
      );
      console.log(
        `   Live Tables: ${C.bold}Stations:${C.reset} ${counts.stations} | ${C.bold}Chargers:${C.reset} ${counts.chargers} | ${C.bold}EVs:${C.reset} ${counts.evs} | ${C.bold}Sessions:${C.reset} ${C.yellow}${counts.sessions}${C.reset} (${sessionGrowthTag})`,
      );
      console.log(`   ${C.bold}Most Recent Committed Charging Sessions:${C.reset}`);

      for (const s of recentSessionsRes.rows) {
        const sTime = new Date(s.start_time).toLocaleTimeString();
        const cost = `₹${parseFloat(s.cost).toFixed(2)}`.padStart(8);
        const energy = `${parseFloat(s.energy_kwh).toFixed(1)} kWh`.padStart(9);
        const status = s.is_ongoing ? `${C.yellow}ACTIVE${C.reset}` : `${C.green}COMPLETED${C.reset}`;
        console.log(
          `   ├─ Session #${C.bold}${s.session_id}${C.reset} [${sTime}] | St#${s.station_id} (${s.station_name.slice(0, 18)}) | ${s.registration_no} | ${C.cyan}${energy}${C.reset} | ${C.yellow}${cost}${C.reset} | ${status}`,
        );
      }

      if (recentAuditRes.rows.length > 0) {
        console.log(`\n   ${C.bold}Recent Admin Audit Log Entries (006_admin_activity_log):${C.reset}`);
        for (const a of recentAuditRes.rows) {
          const aTime = new Date(a.created_at).toLocaleTimeString();
          console.log(
            `   └─ [${aTime}] Action: ${C.bold}${a.action}${C.reset} on ${a.entity_type} #${a.entity_id} (${a.entity_name || ""}) by ${C.dim}${a.admin_email || "system"}${C.reset}`,
          );
        }
      } else {
        console.log(
          `\n   ${C.dim}Tip: Insert a new station or session in the browser UI (Controlled Data Entry tab) to see it appear here live!${C.reset}`,
        );
      }

      console.log(
        `\n${C.dim}────────────────────────────────────────────────────────────────────────────────────────${C.reset}`,
      );
    } catch (err) {
      console.error(`\n[watch-live-db] Error reading databases:`, err);
    }
  }

  const isOnce = process.argv.includes("--once");

  await render();
  if (isOnce) {
    await mongoClient.close();
    await pgPool.end();
    process.exit(0);
  }

  const timer = setInterval(render, 2000);

  process.on("SIGINT", async () => {
    clearInterval(timer);
    await mongoClient.close();
    await pgPool.end();
    console.log(`\n${C.bold}Live monitor closed cleanly.${C.reset}`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal monitor error:", err);
  process.exit(1);
});
