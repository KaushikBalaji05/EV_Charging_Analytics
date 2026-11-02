import "server-only";
import { getMongoDb, MongoGridTelemetry, TELEMETRY_COLLECTION } from "@/lib/db/mongodb";

export type TelemetryFreshnessStatus = "live" | "stale" | "missing" | "unavailable";

export interface StationLiveTelemetryResult {
  status: TelemetryFreshnessStatus;
  isLive: boolean;
  ageSeconds: number | null;
  error?: string;
  latest: MongoGridTelemetry | null;
  history: MongoGridTelemetry[];
  stats: {
    avgVoltage: number | null;
    avgFrequency: number | null;
    avgPowerKw: number | null;
    maxPowerKw: number | null;
    avgGridLoadKw: number | null;
    maxGridLoadKw: number | null;
    sampleCount: number;
  };
}

/** Age threshold in seconds for telemetry to be considered active live streaming */
export const LIVE_TELEMETRY_FRESHNESS_SECONDS = 30;

/** Sanity clamp and validate electrical readings */
function sanitizeReading(r: MongoGridTelemetry): MongoGridTelemetry {
  return {
    ...r,
    voltage_v: Math.max(0, Math.min(1000, Number(r.voltage_v) || 0)),
    current_a: Math.max(0, Math.min(5000, Number(r.current_a) || 0)),
    power_kw: Math.max(0, Math.min(2000, Number(r.power_kw) || 0)),
    frequency_hz: Math.max(40, Math.min(65, Number(r.frequency_hz) || 50.0)),
    grid_load_kw: Math.max(0, Math.min(5000, Number(r.grid_load_kw) || 0)),
  };
}

/** Insert a batch of simulated telemetry readings with sanity checks */
export async function insertTelemetryBatch(
  readings: MongoGridTelemetry[],
): Promise<{ insertedCount: number }> {
  if (readings.length === 0) return { insertedCount: 0 };
  const sanitized = readings.map(sanitizeReading);
  const db = await getMongoDb();
  const collection = db.collection<MongoGridTelemetry>(TELEMETRY_COLLECTION);
  const result = await collection.insertMany(sanitized);
  return { insertedCount: result.insertedCount };
}

/** Fetch the single latest reading for a given station */
export async function getLatestStationTelemetry(
  stationId: number,
): Promise<MongoGridTelemetry | null> {
  try {
    const db = await getMongoDb();
    const collection = db.collection<MongoGridTelemetry>(TELEMETRY_COLLECTION);
    const reading = await collection.findOne(
      { station_id: stationId },
      { sort: { recorded_at: -1 }, maxTimeMS: 5000 },
    );
    return reading ? sanitizeReading(reading) : null;
  } catch (err) {
    console.error(`[telemetry-mongo] getLatestStationTelemetry failed for station ${stationId}:`, err);
    return null;
  }
}

/**
 * Executes a MongoDB aggregation pipeline computing statistical aggregates
 * and returns historical window points for live dashboard charts.
 * Gracefully degrades if MongoDB is down, returning status: 'unavailable'.
 */
export async function getStationLiveTelemetryWithAggregates(
  stationId: number,
  limit: number = 30,
): Promise<StationLiveTelemetryResult> {
  try {
    const db = await getMongoDb();
    const collection = db.collection<MongoGridTelemetry>(TELEMETRY_COLLECTION);

    const [pipelineResult] = await collection
      .aggregate(
        [
          { $match: { station_id: stationId } },
          { $sort: { recorded_at: -1 } },
          {
            $facet: {
              recentWindow: [{ $limit: limit }],
              aggregates: [
                { $limit: 100 },
                {
                  $group: {
                    _id: "$station_id",
                    avgVoltage: { $avg: "$voltage_v" },
                    avgFrequency: { $avg: "$frequency_hz" },
                    avgPowerKw: { $avg: "$power_kw" },
                    maxPowerKw: { $max: "$power_kw" },
                    avgGridLoadKw: { $avg: "$grid_load_kw" },
                    maxGridLoadKw: { $max: "$grid_load_kw" },
                    sampleCount: { $sum: 1 },
                  },
                },
              ],
            },
          },
        ],
        { maxTimeMS: 5000 },
      )
      .toArray();

    const rawHistory: MongoGridTelemetry[] = (pipelineResult?.recentWindow ?? []).reverse();
    const history = rawHistory.map(sanitizeReading);
    const latest: MongoGridTelemetry | null = history.length > 0 ? history[history.length - 1] : null;
    const rawStats = pipelineResult?.aggregates?.[0];

    const stats = {
      avgVoltage: rawStats?.avgVoltage ? Number(rawStats.avgVoltage.toFixed(1)) : null,
      avgFrequency: rawStats?.avgFrequency ? Number(rawStats.avgFrequency.toFixed(3)) : null,
      avgPowerKw: rawStats?.avgPowerKw ? Number(rawStats.avgPowerKw.toFixed(1)) : null,
      maxPowerKw: rawStats?.maxPowerKw ? Number(rawStats.maxPowerKw.toFixed(1)) : null,
      avgGridLoadKw: rawStats?.avgGridLoadKw ? Number(rawStats.avgGridLoadKw.toFixed(1)) : null,
      maxGridLoadKw: rawStats?.maxGridLoadKw ? Number(rawStats.maxGridLoadKw.toFixed(1)) : null,
      sampleCount: rawStats?.sampleCount ?? 0,
    };

    let status: TelemetryFreshnessStatus = "missing";
    let isLive = false;
    let ageSeconds: number | null = null;

    if (latest) {
      const recordedAtMs = new Date(latest.recorded_at).getTime();
      ageSeconds = Math.max(0, Math.round((Date.now() - recordedAtMs) / 1000));
      if (ageSeconds <= LIVE_TELEMETRY_FRESHNESS_SECONDS) {
        status = "live";
        isLive = true;
      } else {
        status = "stale";
        isLive = false;
      }
    }

    return { status, isLive, ageSeconds, latest, history, stats };
  } catch (err) {
    console.error(`[telemetry-mongo] getStationLiveTelemetryWithAggregates error for station ${stationId}:`, err);
    return {
      status: "unavailable",
      isLive: false,
      ageSeconds: null,
      error: "MongoDB telemetry service temporarily unavailable",
      latest: null,
      history: [],
      stats: {
        avgVoltage: null,
        avgFrequency: null,
        avgPowerKw: null,
        maxPowerKw: null,
        avgGridLoadKw: null,
        maxGridLoadKw: null,
        sampleCount: 0,
      },
    };
  }
}

/** Get total telemetry count across all stations with safe fallback */
export async function getTotalMongoTelemetryCount(): Promise<number> {
  try {
    const db = await getMongoDb();
    return await db.collection(TELEMETRY_COLLECTION).countDocuments({}, { maxTimeMS: 5000 });
  } catch (err) {
    console.error("[telemetry-mongo] getTotalMongoTelemetryCount failed:", err);
    return 0;
  }
}
