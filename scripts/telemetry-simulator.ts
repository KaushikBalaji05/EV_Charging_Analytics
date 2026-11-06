#!/usr/bin/env node
/**
 * EV Charging Demand & Grid Load Analytics
 * Controllable Live Telemetry Simulator for MongoDB (Hybrid Architecture)
 *
 * Generates electrically consistent, realistic synthetic telemetry readings for
 * charging stations and streams them into MongoDB collection `grid_telemetry`.
 * All readings are explicitly tagged with `source: "simulated"`.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
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

const DEFAULT_INTERVAL_MS = 5000;
const LOCK_FILE = path.resolve(process.cwd(), ".simulator.pid");
const META_FILE = path.resolve(process.cwd(), ".simulator.meta.json");
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || "ev_charging_analytics";
const TELEMETRY_COLLECTION = "grid_telemetry";

export interface SimulatorMetadata {
  pid: number | null;
  status: "running" | "stopped" | "crashed";
  startedAt: string | null;
  stoppedAt: string | null;
  exitReason: string | null;
  scenario: string;
  intervalMs: number;
  stations: number[];
  lastTickAt: string | null;
  error?: string | null;
}

function writeMeta(meta: Partial<SimulatorMetadata>): void {
  try {
    let existing: Partial<SimulatorMetadata> = {};
    if (fs.existsSync(META_FILE)) {
      try {
        existing = JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
      } catch {
        existing = {};
      }
    }
    const merged = { ...existing, ...meta };
    fs.writeFileSync(META_FILE, JSON.stringify(merged, null, 2), "utf-8");
  } catch {
    // Non-critical
  }
}

// Station specifications (matching PostgreSQL Charging_Station table and seed dataset)
export const STATION_SPECS: Record<number, { name: string; capacityKw: number; voltageNominal: number }> = {
  1: { name: "Central Charging Hub", capacityKw: 100, voltageNominal: 415 },
  2: { name: "Tech Park Charging Hub", capacityKw: 150, voltageNominal: 415 },
  3: { name: "Indiranagar 100ft Rd Hub", capacityKw: 120, voltageNominal: 415 },
  4: { name: "Koramangala 4th Block Hub", capacityKw: 150, voltageNominal: 415 },
  5: { name: "Electronic City Phase 1 Hub", capacityKw: 200, voltageNominal: 415 },
  6: { name: "Whitefield ITPL Hub", capacityKw: 180, voltageNominal: 415 },
  7: { name: "HSR Layout Sector 1 Hub", capacityKw: 100, voltageNominal: 415 },
  8: { name: "MG Road Metro Station Hub", capacityKw: 120, voltageNominal: 415 },
  9: { name: "Hebbal Outer Ring Rd Hub", capacityKw: 240, voltageNominal: 415 },
  10: { name: "Jayanagar 4th T Block Hub", capacityKw: 90, voltageNominal: 415 },
  11: { name: "Bellandur EcoSpace Hub", capacityKw: 160, voltageNominal: 415 },
  12: { name: "Marathahalli Bridge Hub", capacityKw: 140, voltageNominal: 415 },
  13: { name: "Rajajinagar Industrial Hub", capacityKw: 150, voltageNominal: 415 },
  14: { name: "Malleshwaram 8th Cross Hub", capacityKw: 100, voltageNominal: 415 },
  15: { name: "Banashankari BDA Complex Hub", capacityKw: 110, voltageNominal: 415 },
  16: { name: "Yelahanka New Town Hub", capacityKw: 130, voltageNominal: 415 },
  17: { name: "Sarjapur Road Junction Hub", capacityKw: 150, voltageNominal: 415 },
  18: { name: "BTM Layout 2nd Stage Hub", capacityKw: 100, voltageNominal: 415 },
  19: { name: "Domlur Flyover Hub", capacityKw: 120, voltageNominal: 415 },
  20: { name: "Yeshwanthpur Rail Transit Hub", capacityKw: 160, voltageNominal: 415 },
};

export const DEFAULT_STATIONS = [1, 2];

let activeSpecs: Record<number, { name: string; capacityKw: number; voltageNominal: number }> = { ...STATION_SPECS };

export function updateActiveSpecs(newSpecs: Record<number, { name: string; capacityKw: number; voltageNominal: number }>) {
  activeSpecs = { ...activeSpecs, ...newSpecs };
}

export async function resolveTargetStations(explicitStations?: number[]): Promise<{
  stations: number[];
  specs: Record<number, { name: string; capacityKw: number; voltageNominal: number }>;
}> {
  const specs = { ...STATION_SPECS };
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    try {
      const pool = new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 3000,
        ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
      });
      const res = await pool.query<{
        station_id: number;
        station_name: string;
        total_capacity_kw: string | number;
      }>(
        "SELECT station_id, station_name, total_capacity_kw FROM charging_station WHERE operating_status = 'ACTIVE' ORDER BY station_id ASC"
      );
      await pool.end();

      if (res.rows.length > 0) {
        for (const row of res.rows) {
          specs[Number(row.station_id)] = {
            name: row.station_name,
            capacityKw: Number(row.total_capacity_kw),
            voltageNominal: 415,
          };
        }

        if (explicitStations && explicitStations.length > 0) {
          return { stations: explicitStations, specs };
        }

        return {
          stations: res.rows.map((r) => Number(r.station_id)),
          specs,
        };
      }
    } catch (err) {
      // Fallback safely if PG query fails
      console.warn("[simulator] PostgreSQL station discovery unavailable, using static fallback:", err instanceof Error ? err.message : String(err));
    }
  }

  const fallbackStations = explicitStations && explicitStations.length > 0
    ? explicitStations
    : Object.keys(STATION_SPECS).map(Number);

  return { stations: fallbackStations, specs };
}

function createPrng(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let randomFn = Math.random;

interface SimulatorOptions {
  intervalMs: number;
  stations: number[];
  scenario: "diurnal" | "normal" | "overload";
  count: number;
  seed?: number;
  once: boolean;
}

export interface TelemetryPayload {
  station_id: number;
  recorded_at: Date;
  voltage_v: number;
  current_a: number;
  power_kw: number;
  frequency_hz: number;
  grid_load_kw: number;
  source: "simulated";
  metadata: {
    station_name: string;
    capacity_kw: number;
    scenario: string;
    power_factor: number;
    is_overloaded: boolean;
  };
}

function getDiurnalFactor(date: Date): number {
  const istHour = (date.getUTCHours() + 5 + (date.getUTCMinutes() + 30) / 60) % 24;
  if (istHour >= 18 && istHour <= 22) {
    return 0.85 + randomFn() * 0.15;
  } else if (istHour >= 8 && istHour <= 11.5) {
    return 0.70 + randomFn() * 0.20;
  } else if (istHour >= 12 && istHour <= 16) {
    return 0.45 + randomFn() * 0.15;
  } else if (istHour >= 0 && istHour <= 5.5) {
    return 0.15 + randomFn() * 0.10;
  }
  return 0.35 + randomFn() * 0.20;
}

export function generateReading(
  stationId: number,
  timestamp: Date = new Date(),
  scenario: "diurnal" | "normal" | "overload" = "diurnal",
  customSpecs?: Record<number, { name: string; capacityKw: number; voltageNominal: number }>,
): TelemetryPayload {
  const spec = customSpecs?.[stationId] ?? activeSpecs[stationId] ?? STATION_SPECS[stationId] ?? {
    name: `Station ${stationId}`,
    capacityKw: 100,
    voltageNominal: 415,
  };

  let loadRatio = 0.5;
  let forceOverload = false;

  if (scenario === "overload") {
    loadRatio = 1.05 + randomFn() * 0.20;
    forceOverload = true;
  } else if (scenario === "normal") {
    loadRatio = 0.25 + randomFn() * 0.55;
  } else {
    const diurnal = getDiurnalFactor(timestamp);
    if (diurnal > 0.8 && randomFn() < 0.08) {
      loadRatio = 1.04 + randomFn() * 0.12;
      forceOverload = true;
    } else {
      loadRatio = Math.max(0.15, Math.min(0.95, diurnal + (randomFn() - 0.5) * 0.1));
    }
  }

  const gridLoadKw = Number(Math.max(0, spec.capacityKw * loadRatio).toFixed(2));
  const powerKw = Number(Math.max(0, gridLoadKw * (0.82 + randomFn() * 0.10)).toFixed(2));

  // Indian grid frequency 50.00 Hz nominal, physically clamped between 48.5 and 51.5 Hz
  const baseFreq = 50.00 - (loadRatio - 0.5) * 0.15;
  const frequencyHz = Number(
    Math.max(48.5, Math.min(51.5, baseFreq + (randomFn() - 0.5) * 0.04)).toFixed(3),
  );

  // Three-phase voltage 415 V nominal with load sag, physically clamped between 360V and 460V
  const voltageNominal = spec.voltageNominal;
  const vDrop = (loadRatio - 0.4) * 8;
  const voltageV = Number(
    Math.max(360, Math.min(460, voltageNominal - vDrop + (randomFn() - 0.5) * 4)).toFixed(1),
  );

  // Current calculation: Three-phase P = sqrt(3) * V * I * pf / 1000
  const powerFactor = Number((0.95 + randomFn() * 0.03).toFixed(3));
  const currentA = Number(
    Math.max(0, (powerKw * 1000) / (Math.sqrt(3) * voltageV * powerFactor)).toFixed(1),
  );

  return {
    station_id: stationId,
    recorded_at: timestamp,
    voltage_v: voltageV,
    current_a: currentA,
    power_kw: powerKw,
    frequency_hz: frequencyHz,
    grid_load_kw: gridLoadKw,
    source: "simulated",
    metadata: {
      station_name: spec.name,
      capacity_kw: spec.capacityKw,
      scenario,
      power_factor: powerFactor,
      is_overloaded: forceOverload || gridLoadKw > spec.capacityKw,
    },
  };
}

function checkLock(): number | null {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim(), 10);
      if (!isNaN(pid)) {
        process.kill(pid, 0);
        return pid;
      }
    } catch {
      fs.unlinkSync(LOCK_FILE);
    }
  }
  return null;
}

function acquireLock(): void {
  const existingPid = checkLock();
  if (existingPid && existingPid !== process.pid) {
    console.error(`[simulator] Error: Another simulator instance is running (PID: ${existingPid})`);
    process.exit(1);
  }
  fs.writeFileSync(LOCK_FILE, process.pid.toString(), "utf-8");
}

function releaseLock(): void {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      fs.unlinkSync(LOCK_FILE);
    } catch {
      // Ignore
    }
  }
}

function parseCliArgs(): { action: "run" | "stop" | "status" | "daemon"; options: SimulatorOptions; hasExplicitStations: boolean } {
  const args = process.argv.slice(2);
  let action: "run" | "stop" | "status" | "daemon" = "run";
  let hasExplicitStations = false;
  const options: SimulatorOptions = {
    intervalMs: DEFAULT_INTERVAL_MS,
    stations: [...DEFAULT_STATIONS],
    scenario: "diurnal",
    count: 0,
    once: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--daemon") action = "daemon";
    else if (arg === "--stop") action = "stop";
    else if (arg === "--status") action = "status";
    else if (arg === "--once") options.once = true;
    else if (arg === "--interval" && args[i + 1]) {
      options.intervalMs = parseInt(args[++i], 10);
    } else if (arg === "--stations" && args[i + 1]) {
      options.stations = args[++i].split(",").map((s) => parseInt(s.trim(), 10));
      hasExplicitStations = true;
    } else if (arg === "--scenario" && args[i + 1]) {
      options.scenario = args[++i] as SimulatorOptions["scenario"];
    } else if (arg === "--count" && args[i + 1]) {
      options.count = parseInt(args[++i], 10);
    } else if (arg === "--seed" && args[i + 1]) {
      options.seed = parseInt(args[++i], 10);
    }
  }

  return { action, options, hasExplicitStations };
}

async function main() {
  const { action, options, hasExplicitStations } = parseCliArgs();

  if (action === "daemon") {
    const existing = checkLock();
    if (existing) {
      console.log(`[simulator] Simulator is already running (PID: ${existing})`);
      process.exit(0);
    }
    const childArgs = process.argv.slice(2).filter((a) => a !== "--daemon");
    const logFd = fs.openSync(path.resolve(process.cwd(), ".simulator.log"), "a");
    const isWin = process.platform === "win32";
    const tsxBin = path.resolve(process.cwd(), isWin ? "node_modules/.bin/tsx.cmd" : "node_modules/.bin/tsx");
    const scriptPath = path.resolve(process.cwd(), "scripts/telemetry-simulator.ts");

    const execCmd = isWin && !fs.existsSync(tsxBin) ? "npx.cmd" : tsxBin;
    const execArgs = isWin && !fs.existsSync(tsxBin) ? ["tsx", scriptPath, ...childArgs] : [scriptPath, ...childArgs];

    const child = spawn(execCmd, execArgs, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: process.env,
      shell: isWin,
    });
    child.unref();
    console.log(`[simulator] Spawning background simulator daemon...`);
    console.log(`[simulator] Logging to .simulator.log`);
    process.exit(0);
  }

  if (action === "status") {
    const pid = checkLock();
    if (pid) {
      console.log(`[simulator] Simulator is RUNNING (PID: ${pid})`);
      process.exit(0);
    } else {
      console.log("[simulator] Simulator is STOPPED (No active process)");
      process.exit(0);
    }
  }

  if (action === "stop") {
    const pid = checkLock();
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(`[simulator] Sent SIGTERM to PID: ${pid}`);
        releaseLock();
        writeMeta({
          status: "stopped",
          stoppedAt: new Date().toISOString(),
          exitReason: "Stopped by user command (--stop)",
        });
      } catch (e) {
        console.error(`[simulator] Failed to stop PID ${pid}:`, e);
      }
    } else {
      console.log("[simulator] No running simulator instance found.");
      writeMeta({
        status: "stopped",
        stoppedAt: new Date().toISOString(),
        exitReason: "No running process found",
      });
    }
    process.exit(0);
  }

  // Action is "run" (continuous or --once)
  const explicit = hasExplicitStations ? options.stations : undefined;
  const resolved = await resolveTargetStations(explicit);
  options.stations = resolved.stations;
  updateActiveSpecs(resolved.specs);

  acquireLock();
  writeMeta({
    pid: process.pid,
    status: "running",
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    exitReason: null,
    scenario: options.scenario,
    intervalMs: options.intervalMs,
    stations: options.stations,
    lastTickAt: null,
  });

  const cleanup = (reason: string) => {
    writeMeta({
      status: "stopped",
      stoppedAt: new Date().toISOString(),
      exitReason: reason,
    });
    releaseLock();
  };

  process.on("exit", () => cleanup("Process exited"));
  process.on("SIGINT", () => {
    console.log("\n[simulator] Clean shutdown: Telemetry stream terminated safely by operator.");
    cleanup("Operator interrupt (SIGINT)");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n[simulator] Clean shutdown: Telemetry stream terminated safely by system (SIGTERM).");
    cleanup("Terminated by signal (SIGTERM)");
    process.exit(0);
  });

  if (options.seed !== undefined) {
    randomFn = createPrng(options.seed);
    console.log(`[simulator] Initialized seeded PRNG (seed: ${options.seed})`);
  }

  console.log(`[simulator] Connecting to MongoDB (${MONGODB_URI}/${MONGODB_DB_NAME})...`);
  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(MONGODB_DB_NAME);
  const collection = db.collection(TELEMETRY_COLLECTION);

  console.log(`[simulator] Active Configuration:`);
  console.log(`  - Stations: [${options.stations.join(", ")}]`);
  console.log(`  - Interval: ${options.intervalMs} ms`);
  console.log(`  - Scenario: ${options.scenario}`);
  console.log(`  - Mode: ${options.once ? "Single batch (--once)" : options.count > 0 ? `${options.count} iterations` : "Continuous stream"}`);

  let iterations = 0;

  async function tick() {
    iterations++;
    const now = new Date();
    const batch: TelemetryPayload[] = options.stations.map((stId) =>
      generateReading(stId, now, options.scenario),
    );

    await collection.insertMany(batch);
    writeMeta({ lastTickAt: now.toISOString() });

    const summary = batch
      .map(
        (b) =>
          `St#${b.station_id} -> ${b.power_kw}kW / Load:${b.grid_load_kw}kW [${b.voltage_v}V, ${b.frequency_hz}Hz]${b.metadata.is_overloaded ? " ⚠️ OVERLOAD" : ""}`,
      )
      .join(" | ");

    console.log(
      `[${now.toISOString().substring(11, 19)}] Batch #${iterations}: ${summary}`,
    );

    if (options.once || (options.count > 0 && iterations >= options.count)) {
      console.log(`[simulator] Target iterations reached (${iterations}). Shutting down.`);
      await client.close();
      cleanup(`Completed ${iterations} target iterations`);
      process.exit(0);
    }
  }

  await tick();

  if (!options.once && (options.count === 0 || options.count > 1)) {
    setInterval(() => {
      tick().catch((err) => console.error("[simulator] Error during telemetry tick:", err));
    }, options.intervalMs);
  }
}

if (process.env.NODE_ENV !== "test") {
  main().catch((err) => {
    console.error("[simulator] Fatal error:", err);
    try {
      writeMeta({
        status: "crashed",
        stoppedAt: new Date().toISOString(),
        exitReason: "Unhandled exception during startup",
        error: err instanceof Error ? err.message : String(err),
      });
    } catch {
      // ignore
    }
    releaseLock();
    process.exit(1);
  });
}
