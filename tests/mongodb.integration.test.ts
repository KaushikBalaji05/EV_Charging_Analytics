import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoClient } from "mongodb";
import {
  closeMongoConnection,
  getMongoDb,
  initMongoTelemetry,
  MongoGridTelemetry,
  TELEMETRY_COLLECTION,
} from "../src/lib/db/mongodb";
import {
  getLatestStationTelemetry,
  getStationLiveTelemetryWithAggregates,
  insertTelemetryBatch,
} from "../src/lib/db/queries/telemetry-mongo";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const TEST_STATION_ID = 999;

let mongoAvailable = false;

beforeAll(async () => {
  try {
    const probeClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 2000 });
    await probeClient.connect();
    await probeClient.db("admin").command({ ping: 1 });
    await probeClient.close();
    mongoAvailable = true;
  } catch {
    mongoAvailable = false;
  }
});

afterAll(async () => {
  if (mongoAvailable) {
    try {
      const db = await getMongoDb();
      await db.collection(TELEMETRY_COLLECTION).deleteMany({ station_id: TEST_STATION_ID });
    } catch {
      // Ignore
    }
  }
  await closeMongoConnection();
});

describe("MongoDB Live Telemetry Integration Tests (Hybrid Branch)", () => {
  it("connects to MongoDB and responds to ping", async () => {
    if (!mongoAvailable) {
      console.warn("MongoDB is not reachable at", MONGODB_URI, "- skipping test");
      return;
    }
    const db = await getMongoDb();
    const result = await db.command({ ping: 1 });
    expect(result.ok).toBe(1);
  });

  it("initializes collection with indexes and schema validator", async () => {
    if (!mongoAvailable) return;
    const initRes = await initMongoTelemetry();
    expect(initRes.ok).toBe(true);

    const db = await getMongoDb();
    const indexes = await db.collection(TELEMETRY_COLLECTION).indexes();
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain("idx_station_recorded_at");
    expect(indexNames).toContain("idx_recorded_at");
    expect(indexNames).toContain("idx_source");
  });

  it("strictly enforces JSON schema validation with validationAction error", async () => {
    if (!mongoAvailable) return;
    const db = await getMongoDb();
    const collection = db.collection(TELEMETRY_COLLECTION);

    // Should reject non-simulated source
    await expect(
      collection.insertOne({
        station_id: TEST_STATION_ID,
        recorded_at: new Date(),
        voltage_v: 415,
        current_a: 50,
        power_kw: 30,
        frequency_hz: 50,
        grid_load_kw: 60,
        source: "real_hardware",
      }),
    ).rejects.toThrow(/validation/i);

    // Should reject negative voltage
    await expect(
      collection.insertOne({
        station_id: TEST_STATION_ID,
        recorded_at: new Date(),
        voltage_v: -10,
        current_a: 50,
        power_kw: 30,
        frequency_hz: 50,
        grid_load_kw: 60,
        source: "simulated",
      }),
    ).rejects.toThrow(/validation/i);

    // Should reject string station_id
    await expect(
      collection.insertOne({
        station_id: "not-an-int",
        recorded_at: new Date(),
        voltage_v: 415,
        current_a: 50,
        power_kw: 30,
        frequency_hz: 50,
        grid_load_kw: 60,
        source: "simulated",
      }),
    ).rejects.toThrow(/validation/i);
  });

  it("inserts telemetry batches into MongoDB with UTC BSON dates and simulated source", async () => {
    if (!mongoAvailable) return;
    const sampleReadings: MongoGridTelemetry[] = [
      {
        station_id: TEST_STATION_ID,
        recorded_at: new Date(Date.now() - 10000),
        voltage_v: 414.2,
        current_a: 85.0,
        power_kw: 57.5,
        frequency_hz: 50.012,
        grid_load_kw: 68.0,
        source: "simulated",
      },
      {
        station_id: TEST_STATION_ID,
        recorded_at: new Date(),
        voltage_v: 412.0,
        current_a: 98.4,
        power_kw: 66.8,
        frequency_hz: 49.985,
        grid_load_kw: 110.5,
        source: "simulated",
      },
    ];

    const insertRes = await insertTelemetryBatch(sampleReadings);
    expect(insertRes.insertedCount).toBe(2);
  });

  it("retrieves the single latest reading for a station", async () => {
    if (!mongoAvailable) return;
    const latest = await getLatestStationTelemetry(TEST_STATION_ID);
    expect(latest).not.toBeNull();
    expect(latest?.station_id).toBe(TEST_STATION_ID);
    expect(latest?.grid_load_kw).toBe(110.5);
    expect(latest?.source).toBe("simulated");
  });

  it("computes statistical aggregates via MongoDB aggregation pipeline ($match, $facet, $group)", async () => {
    if (!mongoAvailable) return;
    const res = await getStationLiveTelemetryWithAggregates(TEST_STATION_ID, 10);

    expect(res.latest).not.toBeNull();
    expect(res.history.length).toBeGreaterThanOrEqual(2);
    expect(res.stats.sampleCount).toBeGreaterThanOrEqual(2);
    expect(res.stats.avgVoltage).toBeGreaterThan(400);
    expect(res.stats.avgFrequency).toBeGreaterThan(49.0);
    expect(res.stats.maxGridLoadKw).toBeGreaterThanOrEqual(110.5);
  });

  it("preserves legitimate numeric zero values in telemetry statistics", async () => {
    if (!mongoAvailable) return;
    const ZERO_STATION_ID = 998;
    const db = await getMongoDb();
    try {
      await db.collection(TELEMETRY_COLLECTION).deleteMany({ station_id: ZERO_STATION_ID });

      // Insert idle station reading where power_kw and grid_load_kw are strictly 0
      await insertTelemetryBatch([
        {
          station_id: ZERO_STATION_ID,
          recorded_at: new Date(),
          voltage_v: 415.0,
          current_a: 0.0,
          power_kw: 0.0,
          frequency_hz: 50.0,
          grid_load_kw: 0.0,
          source: "simulated",
        },
      ]);

      const res = await getStationLiveTelemetryWithAggregates(ZERO_STATION_ID, 10);
      expect(res.stats.sampleCount).toBe(1);
      expect(res.stats.avgPowerKw).toBe(0);
      expect(res.stats.maxPowerKw).toBe(0);
      expect(res.stats.avgGridLoadKw).toBe(0);
      expect(res.stats.maxGridLoadKw).toBe(0);
      expect(res.stats.avgVoltage).toBe(415.0);
    } finally {
      await db.collection(TELEMETRY_COLLECTION).deleteMany({ station_id: ZERO_STATION_ID });
    }
  });
});
