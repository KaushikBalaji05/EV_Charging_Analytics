#!/usr/bin/env node
/**
 * EV Charging Demand & Grid Load Analytics
 * PostgreSQL Dataset Expansion Script
 *
 * Expands PostgreSQL dataset to target totals without touching or resetting existing records:
 * - charging_station: target 20 records (currently 2 -> inserts 18)
 * - charger:          target 60 records (currently 3 -> inserts 57)
 * - ev:               target 100 records (currently 3 -> inserts 97)
 * - station_capacity: target 20 records (currently 3 -> inserts 17)
 * - charging_session: target 1,000 records (currently 3 -> inserts 997)
 * - grid_telemetry:   PRESERVED (0 inserted)
 * - app_user:         PRESERVED (0 inserted)
 * - auth_session:     PRESERVED (0 inserted)
 *
 * STRICT INTEGRITY & IDEMPOTENCY:
 * - Checks existing record counts before inserting; never exceeds target totals.
 * - Entire execution is transactional (BEGIN ... COMMIT).
 * - Deterministic pseudo-random generation with realistic Bengaluru EV ecosystem attributes.
 * - Does not recreate or alter schema, drop tables, or disable constraints.
 */

import { Pool } from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {}

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@127.0.0.1:5432/ev_charging_analytics";

const TARGETS = {
  charging_station: 20,
  charger: 60,
  ev: 100,
  station_capacity: 20,
  charging_session: 1000,
} as const;

// 18 Realistic Bengaluru Charging Stations
const STATIONS_TO_ADD = [
  { name: "Indiranagar 100ft Rd Hub", location: "100 Feet Rd, Indiranagar, Bengaluru", capacityKw: 120, status: "ACTIVE" },
  { name: "Koramangala 4th Block Hub", location: "80 Feet Rd, 4th Block, Koramangala, Bengaluru", capacityKw: 150, status: "ACTIVE" },
  { name: "Electronic City Phase 1 Hub", location: "Hosur Rd, Electronic City Phase 1, Bengaluru", capacityKw: 200, status: "ACTIVE" },
  { name: "Whitefield ITPL Hub", location: "ITPL Main Rd, Whitefield, Bengaluru", capacityKw: 180, status: "ACTIVE" },
  { name: "HSR Layout Sector 1 Hub", location: "27th Main Rd, Sector 1, HSR Layout, Bengaluru", capacityKw: 100, status: "ACTIVE" },
  { name: "MG Road Metro Station Hub", location: "MG Road Metro Concourse, Bengaluru", capacityKw: 120, status: "ACTIVE" },
  { name: "Hebbal Outer Ring Rd Hub", location: "Hebbal Flyover Junction, Outer Ring Rd, Bengaluru", capacityKw: 240, status: "ACTIVE" },
  { name: "Jayanagar 4th T Block Hub", location: "9th Main Rd, 4th T Block, Jayanagar, Bengaluru", capacityKw: 90, status: "ACTIVE" },
  { name: "Bellandur EcoSpace Hub", location: "Outer Ring Rd, Bellandur, Bengaluru", capacityKw: 160, status: "ACTIVE" },
  { name: "Marathahalli Bridge Hub", location: "HAL Old Airport Rd, Marathahalli, Bengaluru", capacityKw: 140, status: "ACTIVE" },
  { name: "Rajajinagar Industrial Hub", location: "Dr Rajkumar Rd, Rajajinagar, Bengaluru", capacityKw: 150, status: "ACTIVE" },
  { name: "Malleshwaram 8th Cross Hub", location: "Margosa Rd, Malleshwaram, Bengaluru", capacityKw: 100, status: "ACTIVE" },
  { name: "Banashankari BDA Complex Hub", location: "24th Cross Rd, Banashankari 2nd Stage, Bengaluru", capacityKw: 110, status: "ACTIVE" },
  { name: "Yelahanka New Town Hub", location: "Major Sandeep Unnikrishnan Rd, Yelahanka, Bengaluru", capacityKw: 130, status: "ACTIVE" },
  { name: "Sarjapur Road Junction Hub", location: "Sarjapur - Marathahalli Rd, Bengaluru", capacityKw: 150, status: "ACTIVE" },
  { name: "BTM Layout 2nd Stage Hub", location: "Outer Ring Rd, BTM 2nd Stage, Bengaluru", capacityKw: 100, status: "ACTIVE" },
  { name: "Domlur Flyover Hub", location: "Intermediate Ring Rd, Domlur, Bengaluru", capacityKw: 120, status: "ACTIVE" },
  { name: "Yeshwanthpur Rail Transit Hub", location: "Tumkur Rd, Yeshwanthpur, Bengaluru", capacityKw: 160, status: "ACTIVE" },
];

// EV Fleet archetypes
const EV_ARCHETYPES = [
  { model: "Tata Nexon EV", batteryKwh: 40.5, ownerType: "PRIVATE" },
  { model: "MG ZS EV", batteryKwh: 50.3, ownerType: "PRIVATE" },
  { model: "Mahindra XUV400", batteryKwh: 39.4, ownerType: "PRIVATE" },
  { model: "Tata Tiago EV", batteryKwh: 24.0, ownerType: "COMMERCIAL" },
  { model: "Hyundai Ioniq 5", batteryKwh: 72.6, ownerType: "PRIVATE" },
  { model: "Kia EV6", batteryKwh: 77.4, ownerType: "PRIVATE" },
  { model: "BYD Atto 3", batteryKwh: 60.4, ownerType: "PRIVATE" },
  { model: "BMW i4", batteryKwh: 83.9, ownerType: "PRIVATE" },
  { model: "Tata Tigor EV", batteryKwh: 26.0, ownerType: "COMMERCIAL" },
  { model: "Ather 450X", batteryKwh: 3.7, ownerType: "COMMERCIAL" },
  { model: "Ola S1 Pro", batteryKwh: 4.0, ownerType: "COMMERCIAL" },
  { model: "TVS iQube", batteryKwh: 3.04, ownerType: "PRIVATE" },
];

function pseudoRandom(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function runExpansion(dryRun = false) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  const rng = pseudoRandom(1337);

  try {
    console.log(`[seed:pg] Connected to PostgreSQL at ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);

    // Query current counts
    const currentCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM charging_station) AS charging_station,
        (SELECT COUNT(*)::int FROM charger)          AS charger,
        (SELECT COUNT(*)::int FROM ev)               AS ev,
        (SELECT COUNT(*)::int FROM station_capacity) AS station_capacity,
        (SELECT COUNT(*)::int FROM charging_session) AS charging_session,
        (SELECT COUNT(*)::int FROM grid_telemetry)   AS grid_telemetry,
        (SELECT COUNT(*)::int FROM app_user)         AS app_user,
        (SELECT COUNT(*)::int FROM auth_session)     AS auth_session
    `);

    const current = currentCountsRes.rows[0];
    console.log("\n[seed:pg] Current Record Counts:");
    console.table(current);

    if (dryRun) {
      console.log("[seed:pg] Dry run completed without modifications.");
      return;
    }

    await client.query("BEGIN");

    // 1. charging_station: target 20
    const neededStations = Math.max(0, TARGETS.charging_station - current.charging_station);
    console.log(`\n[seed:pg] 1. charging_station: Current = ${current.charging_station}, Target = ${TARGETS.charging_station}, Needed = ${neededStations}`);
    if (neededStations > 0) {
      const stationsToInsert = STATIONS_TO_ADD.slice(0, neededStations);
      for (const st of stationsToInsert) {
        await client.query(
          `INSERT INTO charging_station (station_name, location, total_capacity_kw, operating_status)
           VALUES ($1, $2, $3, $4)`,
          [st.name, st.location, st.capacityKw, st.status]
        );
      }
      console.log(`  -> Inserted ${stationsToInsert.length} charging stations.`);
    }

    // Fetch all active stations
    const stationsRes = await client.query<{ station_id: number; total_capacity_kw: number; station_name: string }>(
      `SELECT station_id, total_capacity_kw, station_name FROM charging_station ORDER BY station_id ASC`
    );
    const allStations = stationsRes.rows;

    // 2. charger: target 60
    const neededChargers = Math.max(0, TARGETS.charger - current.charger);
    console.log(`\n[seed:pg] 2. charger: Current = ${current.charger}, Target = ${TARGETS.charger}, Needed = ${neededChargers}`);
    if (neededChargers > 0) {
      let insertedChargers = 0;
      let stIdx = 0;
      while (insertedChargers < neededChargers) {
        const st = allStations[stIdx % allStations.length];
        const chargerNum = insertedChargers + 1;
        const isDc = chargerNum % 3 !== 0;
        const type = isDc ? "DC_FAST" : chargerNum % 2 === 0 ? "AC_NORMAL" : "AC_FAST";
        const power = isDc ? (st.total_capacity_kw >= 180 ? 120 : 60) : type === "AC_FAST" ? 43 : 22;
        const status = chargerNum % 9 === 0 ? "IN_USE" : "AVAILABLE";

        await client.query(
          `INSERT INTO charger (station_id, charger_type, rated_power_kw, status)
           VALUES ($1, $2, $3, $4)`,
          [st.station_id, type, power, status]
        );

        insertedChargers++;
        stIdx++;
      }
      console.log(`  -> Inserted ${insertedChargers} chargers.`);
    }

    // Fetch all chargers
    const chargersRes = await client.query<{ charger_id: number; station_id: number; rated_power_kw: number }>(
      `SELECT charger_id, station_id, rated_power_kw FROM charger ORDER BY charger_id ASC`
    );
    const allChargers = chargersRes.rows;

    // 3. ev: target 100
    const neededEvs = Math.max(0, TARGETS.ev - current.ev);
    console.log(`\n[seed:pg] 3. ev: Current = ${current.ev}, Target = ${TARGETS.ev}, Needed = ${neededEvs}`);
    if (neededEvs > 0) {
      // Find highest existing registration number suffix to avoid collisions
      const maxRegRes = await client.query<{ max_reg: string }>(
        `SELECT registration_no AS max_reg FROM ev WHERE registration_no ~ '^KA01EV\\d{4}$' ORDER BY registration_no DESC LIMIT 1`
      );
      let nextRegNum = 1004;
      if (maxRegRes.rows.length > 0 && maxRegRes.rows[0].max_reg) {
        const match = maxRegRes.rows[0].max_reg.match(/\d+$/);
        if (match) nextRegNum = parseInt(match[0], 10) + 1;
      }

      for (let i = 0; i < neededEvs; i++) {
        const reg = `KA01EV${String(nextRegNum + i).padStart(4, "0")}`;
        const archetype = EV_ARCHETYPES[i % EV_ARCHETYPES.length];
        await client.query(
          `INSERT INTO ev (registration_no, model, battery_capacity_kwh, owner_type)
           VALUES ($1, $2, $3, $4)`,
          [reg, archetype.model, archetype.batteryKwh, archetype.ownerType]
        );
      }
      console.log(`  -> Inserted ${neededEvs} electric vehicles.`);
    }

    // Fetch all EVs
    const evsRes = await client.query<{ ev_id: number; battery_capacity_kwh: number }>(
      `SELECT ev_id, battery_capacity_kwh FROM ev ORDER BY ev_id ASC`
    );
    const allEvs = evsRes.rows;

    // 4. station_capacity: target 20
    const neededSnapshots = Math.max(0, TARGETS.station_capacity - current.station_capacity);
    console.log(`\n[seed:pg] 4. station_capacity: Current = ${current.station_capacity}, Target = ${TARGETS.station_capacity}, Needed = ${neededSnapshots}`);
    if (neededSnapshots > 0) {
      const now = new Date();
      for (let i = 0; i < neededSnapshots; i++) {
        const st = allStations[(i + 2) % allStations.length]; // rotate across stations
        const daysAgo = (i % 7) + 1;
        const recordedAt = new Date(now.getTime() - daysAgo * 24 * 3600 * 1000);
        recordedAt.setHours(17 + (i % 4), (i * 7) % 60, 0, 0);

        // Occasional overload scenario (approx 15% of records)
        const isOverload = i % 7 === 0;
        const loadFactor = isOverload ? 1.08 + rng() * 0.15 : 0.45 + rng() * 0.45;
        const currentLoad = Number((st.total_capacity_kw * loadFactor).toFixed(2));

        // The BEFORE INSERT trigger trg_station_capacity_compute computes utilization_pct and overload_status
        await client.query(
          `INSERT INTO station_capacity (station_id, recorded_at, max_load_kw, current_load_kw)
           VALUES ($1, $2, $3, $4)`,
          [st.station_id, recordedAt.toISOString(), st.total_capacity_kw, currentLoad]
        );
      }
      console.log(`  -> Inserted ${neededSnapshots} station capacity snapshots.`);
    }

    // 5. charging_session: target 1000
    const neededSessions = Math.max(0, TARGETS.charging_session - current.charging_session);
    console.log(`\n[seed:pg] 5. charging_session: Current = ${current.charging_session}, Target = ${TARGETS.charging_session}, Needed = ${neededSessions}`);
    if (neededSessions > 0) {
      const now = new Date();
      const tariffPerKwh = 15.0; // Commercial tariff INR/kWh

      for (let s = 1; s <= neededSessions; s++) {
        const charger = allChargers[Math.floor(rng() * allChargers.length)];
        const ev = allEvs[Math.floor(rng() * allEvs.length)];

        // Spread across past 90 days
        const daysAgo = Math.floor(rng() * 90) + 1;
        const baseDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);

        // Diurnal distribution
        const rHour = rng();
        let hour: number;
        if (rHour < 0.35) {
          // Morning commute peak 08:00 - 11:00
          hour = 8 + Math.floor(rng() * 3);
        } else if (rHour < 0.75) {
          // Evening commute peak 17:00 - 21:00
          hour = 17 + Math.floor(rng() * 4);
        } else {
          // Daylight / midday off-peak 12:00 - 16:00
          hour = 12 + Math.floor(rng() * 4);
        }

        const minute = Math.floor(rng() * 60);
        const startTime = new Date(baseDate.setHours(hour, minute, 0, 0));

        // Duration: 20 to 110 minutes
        const durationMins = 20 + Math.floor(rng() * 90);
        const endTime = new Date(startTime.getTime() + durationMins * 60 * 1000);

        // Energy consumed bounded by battery capacity and charger rating
        const maxDeliverable = (charger.rated_power_kw * durationMins) / 60;
        const energyKwh = Math.min(
          Math.max(4.0, Number((maxDeliverable * (0.65 + rng() * 0.3)).toFixed(2))),
          ev.battery_capacity_kwh * 0.95
        );
        const peakPower = Math.min(charger.rated_power_kw, Number(((energyKwh / (durationMins / 60)) * 1.15).toFixed(2)));
        const cost = Number((energyKwh * tariffPerKwh).toFixed(2));

        await client.query(
          `INSERT INTO charging_session (ev_id, charger_id, start_time, end_time, energy_kwh, peak_power_kw, cost)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ev.ev_id, charger.charger_id, startTime.toISOString(), endTime.toISOString(), energyKwh, peakPower, cost]
        );
      }
      console.log(`  -> Inserted ${neededSessions} charging sessions.`);
    }

    await client.query("COMMIT");
    console.log("\n[seed:pg] Transaction successfully committed!");

    // Final verification of counts
    const finalCountsRes = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM charging_station) AS charging_station,
        (SELECT COUNT(*)::int FROM charger)          AS charger,
        (SELECT COUNT(*)::int FROM ev)               AS ev,
        (SELECT COUNT(*)::int FROM station_capacity) AS station_capacity,
        (SELECT COUNT(*)::int FROM charging_session) AS charging_session,
        (SELECT COUNT(*)::int FROM grid_telemetry)   AS grid_telemetry,
        (SELECT COUNT(*)::int FROM app_user)         AS app_user,
        (SELECT COUNT(*)::int FROM auth_session)     AS auth_session
    `);

    console.log("\n[seed:pg] Final Record Counts:");
    console.table(finalCountsRes.rows[0]);

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[seed:pg] Transaction failed and rolled back:", err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.env.NODE_ENV !== "test" && !process.env.TEST_IMPORT) {
  const isDryRun = process.argv.includes("--dry-run");
  runExpansion(isDryRun).catch(() => process.exit(1));
}
