import "server-only";
import fs from "node:fs";
import path from "node:path";
import { query } from "@/lib/db/pool";
import { getMongoDb, isMongoAvailable, TELEMETRY_COLLECTION } from "@/lib/db/mongodb";
import { ApiError } from "@/lib/api/errors";
import {
  ALLOWED_PG_TABLES,
  ALLOWED_MONGO_COLLECTIONS,
  type AllowedPgTable,
  type AllowedMongoCollection,
  type DatabaseStatus,
  type SimulatorInfo,
  type TableColumnMetadata,
  type TableRecordsResult,
  type MongoRecordsResult,
  type LiveTelemetrySummary,
  type LiveTelemetryTrendPoint,
  type StationOptionItem,
  type ChargerOptionItem,
  type EvOptionItem,
} from "@/lib/types/data-admin";

export * from "@/lib/types/data-admin";

// ============================================================================
// OVERVIEW & HEALTH CHECKS
// ============================================================================

export async function getPostgresOverview(): Promise<DatabaseStatus> {
  const start = performance.now();
  try {
    const ping = await query<{ current_database: string; version: string; now: string }>(
      `SELECT current_database(), version(), now()::text`
    );
    const latencyMs = Math.round(performance.now() - start);

    // Fetch counts for operational tables in parallel
    const tableCounts = await Promise.all(
      ALLOWED_PG_TABLES.map(async (tbl) => {
        try {
          const res = await query<{ count: number }>(`SELECT count(*)::int AS count FROM "${tbl}"`);
          return { table: tbl, count: res[0]?.count ?? 0 };
        } catch {
          return { table: tbl, count: 0 };
        }
      })
    );

    const countsMap = Object.fromEntries(tableCounts.map((t) => [t.table, t.count]));

    return {
      name: ping[0]?.current_database ?? "ev_charging_analytics",
      type: "postgresql",
      status: "connected",
      latencyMs,
      lastChecked: new Date().toISOString(),
      stats: {
        tables: countsMap,
        version: ping[0]?.version ? ping[0].version.split(" on ")[0] : "PostgreSQL",
      },
    };
  } catch (err) {
    return {
      name: "ev_charging_analytics",
      type: "postgresql",
      status: "error",
      latencyMs: null,
      lastChecked: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      stats: {},
    };
  }
}

export async function getMongoOverview(): Promise<DatabaseStatus> {
  const start = performance.now();
  try {
    const isUp = await isMongoAvailable(3000);
    if (!isUp) {
      throw new Error("MongoDB server is unreachable or timed out (ping failed)");
    }
    const latencyMs = Math.round(performance.now() - start);
    const db = await getMongoDb();
    const colList = await db.listCollections().toArray();
    const collectionNames = colList.map((c) => c.name);

    let docCount = 0;
    let distinctStations: number[] = [];
    let latestTimestamp: string | null = null;

    if (collectionNames.includes(TELEMETRY_COLLECTION)) {
      const col = db.collection(TELEMETRY_COLLECTION);
      docCount = await col.countDocuments();
      distinctStations = (await col.distinct("station_id")) as number[];
      const latestDoc = await col.findOne(
        {},
        { sort: { recorded_at: -1 }, projection: { recorded_at: 1 } }
      );
      if (latestDoc?.recorded_at) {
        latestTimestamp =
          latestDoc.recorded_at instanceof Date
            ? latestDoc.recorded_at.toISOString()
            : String(latestDoc.recorded_at);
      }
    }

    return {
      name: db.databaseName,
      type: "mongodb",
      status: "connected",
      latencyMs,
      lastChecked: new Date().toISOString(),
      stats: {
        collections: collectionNames,
        telemetryCount: docCount,
        distinctStations,
        latestTelemetryAt: latestTimestamp,
      },
    };
  } catch (err) {
    return {
      name: "ev_charging_analytics",
      type: "mongodb",
      status: "error",
      latencyMs: null,
      lastChecked: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      stats: {},
    };
  }
}

export async function getSimulatorInfo(): Promise<SimulatorInfo> {
  const lockFile = path.resolve(process.cwd(), ".simulator.pid");
  const logFile = path.resolve(process.cwd(), ".simulator.log");

  let pid: number | null = null;
  let isRunning = false;

  if (fs.existsSync(lockFile)) {
    try {
      const content = fs.readFileSync(lockFile, "utf-8").trim();
      const parsedPid = parseInt(content, 10);
      if (!isNaN(parsedPid)) {
        process.kill(parsedPid, 0); // throws if process is not alive
        pid = parsedPid;
        isRunning = true;
      }
    } catch {
      // Process is not running or stale lock
      isRunning = false;
    }
  }

  // Read recent logs if present
  const recentLogs: string[] = [];
  if (fs.existsSync(logFile)) {
    try {
      const logContent = fs.readFileSync(logFile, "utf-8");
      const lines = logContent.split(/\r?\n/).filter(Boolean);
      recentLogs.push(...lines.slice(-10));
    } catch {
      // ignore
    }
  }

  // Get latest telemetry timestamp from MongoDB
  let latestTelemetryAt: string | null = null;
  try {
    const db = await getMongoDb();
    const col = db.collection(TELEMETRY_COLLECTION);
    const latestDoc = await col.findOne(
      {},
      { sort: { recorded_at: -1 }, projection: { recorded_at: 1 } }
    );
    if (latestDoc?.recorded_at) {
      latestTelemetryAt =
        latestDoc.recorded_at instanceof Date
          ? latestDoc.recorded_at.toISOString()
          : String(latestDoc.recorded_at);
    }
  } catch {
    // Mongo might be unavailable
  }

  return {
    status: isRunning ? "running" : "stopped",
    pid,
    configuredIntervalMs: 5000,
    simulatedStations: [1, 2],
    latestTelemetryAt,
    recentLogs,
  };
}

// ============================================================================
// POSTGRESQL TABLE EXPLORER
// ============================================================================

export function assertAllowedPgTable(table: string): asserts table is AllowedPgTable {
  if (!ALLOWED_PG_TABLES.includes(table as AllowedPgTable)) {
    throw new ApiError(400, "INVALID_TABLE", `Table '${table}' is not in the allowed database tables list.`);
  }
}

export async function getTableColumns(table: string): Promise<TableColumnMetadata[]> {
  assertAllowedPgTable(table);

  // Column definitions
  const columns = await query<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );

  // Primary key columns
  const pkRes = await query<{ column_name: string }>(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1`,
    [table]
  );
  const pkSet = new Set(pkRes.map((r) => r.column_name));

  return columns.map((col) => ({
    name: col.column_name,
    dataType: col.data_type,
    isNullable: col.is_nullable === "YES",
    isPrimaryKey: pkSet.has(col.column_name),
  }));
}

export async function queryTableRecords(options: {
  table: string;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}): Promise<TableRecordsResult> {
  const { table } = options;
  assertAllowedPgTable(table);

  const columns = await getTableColumns(table);
  const columnNames = columns.map((c) => c.name);

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;

  // Validate sortBy column against actual columns
  let sortBy = columnNames[0] || "1";
  if (options.sortBy && columnNames.includes(options.sortBy)) {
    sortBy = options.sortBy;
  }
  const sortOrder = options.sortOrder?.toLowerCase() === "asc" ? "ASC" : "DESC";

  // Build safe search filter if requested
  const params: unknown[] = [];
  let whereClause = "";

  if (options.search && options.search.trim()) {
    const term = `%${options.search.trim()}%`;
    params.push(term);
    const searchIdx = params.length;

    // Search text / varchar columns, or cast numbers to text
    const searchConditions = columns
      .filter((c) => ["character varying", "text", "character"].includes(c.dataType))
      .map((c) => `"${c.name}"::text ILIKE $${searchIdx}`);

    if (searchConditions.length > 0) {
      whereClause = `WHERE ${searchConditions.join(" OR ")}`;
    }
  }

  // Total count
  const countSql = `SELECT count(*)::int AS count FROM "${table}" ${whereClause}`;
  const countRes = await query<{ count: number }>(countSql, params);
  const totalCount = countRes[0]?.count ?? 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;

  // Data query
  const dataParams = [...params, limit, offset];
  const limitParamIdx = dataParams.length - 1;
  const offsetParamIdx = dataParams.length;

  const dataSql = `
    SELECT *
      FROM "${table}"
    ${whereClause}
     ORDER BY "${sortBy}" ${sortOrder}
     LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
  `;

  const rows = await query<Record<string, unknown>>(dataSql, dataParams);

  return {
    table,
    columns,
    rows,
    totalCount,
    page,
    limit,
    totalPages,
  };
}

// ============================================================================
// MONGODB COLLECTION EXPLORER
// ============================================================================

export function assertAllowedMongoCollection(collection: string): asserts collection is AllowedMongoCollection {
  if (!ALLOWED_MONGO_COLLECTIONS.includes(collection as AllowedMongoCollection)) {
    throw new ApiError(400, "INVALID_COLLECTION", `Collection '${collection}' is not in the allowed collections list.`);
  }
}

export async function queryMongoRecords(options: {
  collection: string;
  page?: number;
  limit?: number;
  stationId?: number;
}): Promise<MongoRecordsResult> {
  const { collection: colName } = options;
  assertAllowedMongoCollection(colName);

  const db = await getMongoDb();
  const collection = db.collection(colName);

  const filter: Record<string, unknown> = {};
  if (options.stationId !== undefined && !isNaN(options.stationId)) {
    filter.station_id = options.stationId;
  }

  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const [totalCount, docs] = await Promise.all([
    collection.countDocuments(filter),
    collection
      .find(filter)
      .sort({ recorded_at: -1 })
      .skip(skip)
      .limit(limit)
      .toArray(),
  ]);

  const totalPages = Math.ceil(totalCount / limit) || 1;

  // Format ObjectId to string for clean JSON serialization
  const serialized = docs.map((doc) => ({
    ...doc,
    _id: doc._id?.toString(),
    recorded_at:
      doc.recorded_at instanceof Date
        ? doc.recorded_at.toISOString()
        : doc.recorded_at,
  }));

  return {
    collection: colName,
    documents: serialized,
    totalCount,
    page,
    limit,
    totalPages,
  };
}

// ============================================================================
// LIVE TELEMETRY & TRENDS
// ============================================================================

export async function getLiveTelemetryOverview(): Promise<LiveTelemetrySummary[]> {
  const db = await getMongoDb();
  const col = db.collection(TELEMETRY_COLLECTION);

  // Distinct station IDs
  const stationIds = ((await col.distinct("station_id")) as number[]).sort((a, b) => a - b);
  if (stationIds.length === 0) return [];

  // Query latest document for each station
  const summaries: LiveTelemetrySummary[] = [];

  for (const sId of stationIds) {
    const latest = await col.findOne({ station_id: sId }, { sort: { recorded_at: -1 } });
    if (latest) {
      summaries.push({
        stationId: sId,
        stationName: latest.metadata?.station_name ?? `Station #${sId}`,
        recordedAt:
          latest.recorded_at instanceof Date
            ? latest.recorded_at.toISOString()
            : String(latest.recorded_at),
        voltageV: Number(latest.voltage_v) || 0,
        currentA: Number(latest.current_a) || 0,
        powerKw: Number(latest.power_kw) || 0,
        frequencyHz: Number(latest.frequency_hz) || 0,
        gridLoadKw: Number(latest.grid_load_kw) || 0,
        source: latest.source ?? "simulated",
        isOverloaded: Boolean(latest.metadata?.is_overloaded),
        capacityKw: Number(latest.metadata?.capacity_kw) || 100,
      });
    }
  }

  return summaries;
}

export async function getRecentTelemetryTrend(stationId?: number, limit = 20): Promise<LiveTelemetryTrendPoint[]> {
  const db = await getMongoDb();
  const col = db.collection(TELEMETRY_COLLECTION);

  const filter: Record<string, unknown> = {};
  if (stationId !== undefined && !isNaN(stationId)) {
    filter.station_id = stationId;
  }

  const docs = await col
    .find(filter)
    .sort({ recorded_at: -1 })
    .limit(limit)
    .toArray();

  // Return in chronological order for charting
  return docs.reverse().map((d) => ({
    recordedAt:
      d.recorded_at instanceof Date
        ? d.recorded_at.toLocaleTimeString()
        : String(d.recorded_at),
    stationId: d.station_id,
    powerKw: Number(d.power_kw) || 0,
    gridLoadKw: Number(d.grid_load_kw) || 0,
    voltageV: Number(d.voltage_v) || 0,
  }));
}

// ============================================================================
// CONTROLLED DATA ENTRY (STATIONS & SESSIONS)
// ============================================================================

export async function getDataEntryOptions(): Promise<{
  stations: StationOptionItem[];
  chargers: ChargerOptionItem[];
  evs: EvOptionItem[];
}> {
  const [stations, chargers, evs] = await Promise.all([
    query<StationOptionItem>(
      `SELECT station_id AS "stationId", station_name AS "stationName", total_capacity_kw AS "totalCapacityKw", operating_status AS "status"
         FROM charging_station
        ORDER BY station_name ASC`
    ),
    query<ChargerOptionItem>(
      `SELECT charger_id AS "chargerId", station_id AS "stationId", charger_type AS "chargerType", rated_power_kw AS "ratedPowerKw", status
         FROM charger
        ORDER BY station_id ASC, charger_id ASC`
    ),
    query<EvOptionItem>(
      `SELECT ev_id AS "evId", registration_no AS "registrationNo", model, battery_capacity_kwh AS "batteryCapacityKwh"
         FROM ev
        ORDER BY registration_no ASC`
    ),
  ]);

  return { stations, chargers, evs };
}

export interface InsertStationInput {
  station_name: string;
  location: string;
  total_capacity_kw: number;
  operating_status: "ACTIVE" | "INACTIVE" | "MAINTENANCE";
}

export async function insertChargingStation(input: InsertStationInput): Promise<{ stationId: number }> {
  const { station_name, location, total_capacity_kw, operating_status } = input;

  const res = await query<{ station_id: number }>(
    `INSERT INTO charging_station (station_name, location, total_capacity_kw, operating_status)
     VALUES ($1, $2, $3, $4)
     RETURNING station_id`,
    [station_name.trim(), location.trim(), total_capacity_kw, operating_status]
  );

  return { stationId: res[0].station_id };
}

export interface InsertSessionInput {
  station_id: number;
  charger_id: number;
  ev_id: number;
  start_time: string;
  end_time?: string | null;
  energy_kwh: number;
  peak_power_kw?: number | null;
  cost: number;
}

export async function insertChargingSession(input: InsertSessionInput): Promise<{ sessionId: number }> {
  const { station_id, charger_id, ev_id, start_time, end_time, energy_kwh, peak_power_kw, cost } = input;

  // Validate that charger belongs to the selected station
  const chargerCheck = await query<{ charger_id: number }>(
    `SELECT charger_id FROM charger WHERE charger_id = $1 AND station_id = $2`,
    [charger_id, station_id]
  );
  if (chargerCheck.length === 0) {
    throw new ApiError(400, "INVALID_CHARGER", `Charger #${charger_id} does not belong to Station #${station_id}.`);
  }

  // Validate that EV exists
  const evCheck = await query<{ ev_id: number }>(`SELECT ev_id FROM ev WHERE ev_id = $1`, [ev_id]);
  if (evCheck.length === 0) {
    throw new ApiError(400, "INVALID_EV", `Electric Vehicle #${ev_id} does not exist.`);
  }

  // Validate timestamps
  const startDate = new Date(start_time);
  if (isNaN(startDate.getTime())) {
    throw new ApiError(400, "INVALID_TIMESTAMP", "Start time is not a valid date/timestamp.");
  }

  let endDate: Date | null = null;
  if (end_time) {
    endDate = new Date(end_time);
    if (isNaN(endDate.getTime())) {
      throw new ApiError(400, "INVALID_TIMESTAMP", "End time is not a valid date/timestamp.");
    }
    if (endDate < startDate) {
      throw new ApiError(400, "INVALID_TIME_RANGE", "End time cannot be earlier than start time.");
    }
  }

  const res = await query<{ session_id: number }>(
    `INSERT INTO charging_session (ev_id, charger_id, start_time, end_time, energy_kwh, peak_power_kw, cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING session_id`,
    [
      ev_id,
      charger_id,
      startDate.toISOString().replace("T", " ").replace("Z", ""),
      endDate ? endDate.toISOString().replace("T", " ").replace("Z", "") : null,
      energy_kwh,
      peak_power_kw ?? null,
      cost,
    ]
  );

  return { sessionId: res[0].session_id };
}

// ============================================================================
// RFC 4180 CSV SERIALIZER WITH FORMULA INJECTION MITIGATION
// ============================================================================

export function serializeToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    let str = typeof val === "object" ? JSON.stringify(val) : String(val);

    // Prevent CSV formula injection in spreadsheet software (Excel, LibreOffice)
    if (/^[=+@-]/.test(str)) {
      str = `'${str}`;
    }

    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => headers.map((h) => escapeCell(row[h])).join(",")),
  ];

  return csvLines.join("\r\n");
}
