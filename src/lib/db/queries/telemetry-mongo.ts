import "server-only";
import { getMongoDb, MongoGridTelemetry, TELEMETRY_COLLECTION } from "@/lib/db/mongodb";

export interface StationLiveTelemetryResult {
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

/** Insert a batch of simulated telemetry readings */
export async function insertTelemetryBatch(
  readings: MongoGridTelemetry[],
): Promise<{ insertedCount: number }> {
  if (readings.length === 0) return { insertedCount: 0 };
  const db = await getMongoDb();
  const collection = db.collection<MongoGridTelemetry>(TELEMETRY_COLLECTION);
  const result = await collection.insertMany(readings);
  return { insertedCount: result.insertedCount };
}

/** Fetch the single latest reading for a given station */
export async function getLatestStationTelemetry(
  stationId: number,
): Promise<MongoGridTelemetry | null> {
  const db = await getMongoDb();
  const collection = db.collection<MongoGridTelemetry>(TELEMETRY_COLLECTION);
  return collection.findOne(
    { station_id: stationId },
    { sort: { recorded_at: -1 } },
  );
}

/**
 * Executes a MongoDB aggregation pipeline computing statistical aggregates
 * and returns historical window points for live dashboard charts.
 */
export async function getStationLiveTelemetryWithAggregates(
  stationId: number,
  limit: number = 30,
): Promise<StationLiveTelemetryResult> {
  const db = await getMongoDb();
  const collection = db.collection<MongoGridTelemetry>(TELEMETRY_COLLECTION);

  const [pipelineResult] = await collection
    .aggregate([
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
    ])
    .toArray();

  const history: MongoGridTelemetry[] = (pipelineResult?.recentWindow ?? []).reverse();
  const latest: MongoGridTelemetry | null = history.length > 0 ? history[history.length - 1] : null;
  const rawStats = pipelineResult?.aggregates?.[0];

  const roundOrNull = (val: unknown, decimals: number): number | null =>
    typeof val === "number" && !Number.isNaN(val) ? Number(val.toFixed(decimals)) : null;

  const stats = {
    avgVoltage: roundOrNull(rawStats?.avgVoltage, 1),
    avgFrequency: roundOrNull(rawStats?.avgFrequency, 3),
    avgPowerKw: roundOrNull(rawStats?.avgPowerKw, 1),
    maxPowerKw: roundOrNull(rawStats?.maxPowerKw, 1),
    avgGridLoadKw: roundOrNull(rawStats?.avgGridLoadKw, 1),
    maxGridLoadKw: roundOrNull(rawStats?.maxGridLoadKw, 1),
    sampleCount: rawStats?.sampleCount ?? 0,
  };

  return { latest, history, stats };
}

/** Get total telemetry count across all stations */
export async function getTotalMongoTelemetryCount(): Promise<number> {
  const db = await getMongoDb();
  return db.collection(TELEMETRY_COLLECTION).countDocuments();
}
