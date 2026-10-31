import "server-only";
import { MongoClient, Db, ObjectId } from "mongodb";
import { getEnv } from "@/lib/env";

export interface MongoGridTelemetry {
  _id?: ObjectId;
  station_id: number;
  recorded_at: Date; // UTC BSON Date
  voltage_v: number;
  current_a: number;
  power_kw: number;
  frequency_hz: number;
  grid_load_kw: number;
  source: "simulated";
  metadata?: Record<string, unknown>;
}

const globalForMongo = globalThis as unknown as {
  __mongoClient?: MongoClient;
  __mongoClientPromise?: Promise<MongoClient>;
};

export const TELEMETRY_COLLECTION = "grid_telemetry";

function getMongoConfig(): { uri: string; dbName: string } {
  try {
    const env = getEnv();
    return {
      uri: env.MONGODB_URI,
      dbName: env.MONGODB_DB_NAME,
    };
  } catch {
    return {
      uri: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
      dbName: process.env.MONGODB_DB_NAME || "ev_charging_analytics",
    };
  }
}

/** Get or initialize the cached MongoClient singleton */
export async function getMongoClient(): Promise<MongoClient> {
  if (globalForMongo.__mongoClient) {
    return globalForMongo.__mongoClient;
  }

  if (!globalForMongo.__mongoClientPromise) {
    const config = getMongoConfig();
    const client = new MongoClient(config.uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    globalForMongo.__mongoClientPromise = client.connect().then((connectedClient) => {
      globalForMongo.__mongoClient = connectedClient;
      return connectedClient;
    });
  }

  return globalForMongo.__mongoClientPromise;
}

/** Get reference to the configured MongoDB database */
export async function getMongoDb(): Promise<Db> {
  const config = getMongoConfig();
  const client = await getMongoClient();
  return client.db(config.dbName);
}

/**
 * Initializes the grid_telemetry collection with strict JSON schema validation and indexes.
 * Safe to re-run idempotently.
 */
export async function initMongoTelemetry(): Promise<{ ok: boolean; message: string }> {
  const db = await getMongoDb();
  const collections = await db.listCollections({ name: TELEMETRY_COLLECTION }).toArray();

  const validator = {
    $jsonSchema: {
      bsonType: "object",
      required: [
        "station_id",
        "recorded_at",
        "voltage_v",
        "current_a",
        "power_kw",
        "frequency_hz",
        "grid_load_kw",
        "source",
      ],
      properties: {
        station_id: {
          bsonType: "int",
          description: "Foreign key matching PostgreSQL Charging_Station(station_id)",
        },
        recorded_at: {
          bsonType: "date",
          description: "UTC BSON date timestamp of sensor reading",
        },
        voltage_v: {
          bsonType: ["double", "int", "decimal"],
          minimum: 0,
          description: "RMS bus voltage in Volts",
        },
        current_a: {
          bsonType: ["double", "int", "decimal"],
          minimum: 0,
          description: "Total phase current in Amperes",
        },
        power_kw: {
          bsonType: ["double", "int", "decimal"],
          minimum: 0,
          description: "Instantaneous active EV charging power draw in kW",
        },
        frequency_hz: {
          bsonType: ["double", "int", "decimal"],
          minimum: 0,
          description: "AC grid frequency in Hertz",
        },
        grid_load_kw: {
          bsonType: ["double", "int", "decimal"],
          minimum: 0,
          description: "Station transformer or local feeder load in kW",
        },
        source: {
          enum: ["simulated"],
          description: "Must strictly be 'simulated' to preserve truthful data labeling",
        },
        metadata: {
          bsonType: "object",
          description: "Optional semi-structured contextual telemetry attributes",
        },
      },
    },
  };

  if (collections.length === 0) {
    await db.createCollection(TELEMETRY_COLLECTION, {
      validator,
      validationAction: "error",
      validationLevel: "strict",
    });
  } else {
    await db.command({
      collMod: TELEMETRY_COLLECTION,
      validator,
      validationAction: "error",
      validationLevel: "strict",
    });
  }

  const collection = db.collection<MongoGridTelemetry>(TELEMETRY_COLLECTION);

  // High-performance compound time-series index: station_id + recorded_at DESC
  await collection.createIndex(
    { station_id: 1, recorded_at: -1 },
    { name: "idx_station_recorded_at" },
  );

  // Global time-series index
  await collection.createIndex(
    { recorded_at: -1 },
    { name: "idx_recorded_at" },
  );

  // Data origin filter index
  await collection.createIndex(
    { source: 1 },
    { name: "idx_source" },
  );

  return { ok: true, message: "MongoDB telemetry schema and indexes verified" };
}

/** Close client during tests or graceful shutdown */
export async function closeMongoConnection(): Promise<void> {
  if (globalForMongo.__mongoClient) {
    await globalForMongo.__mongoClient.close();
    globalForMongo.__mongoClient = undefined;
    globalForMongo.__mongoClientPromise = undefined;
  }
}
