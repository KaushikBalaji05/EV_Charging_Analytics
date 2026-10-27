import "server-only";
import { ApiError } from "@/lib/api/errors";
import { query } from "@/lib/db/pool";
import { dir, likePattern, offsetFor, paged, rangeClause, type Paged } from "@/lib/db/queries/shared";
import type { RankMetric, SortOrder, StationSort, StationStatus } from "@/lib/validation/listing";

// ---------- types ----------
export interface StationMetrics {
  stationId: number;
  stationName: string;
  location: string;
  operatingStatus: StationStatus;
  /** Permitted station load (charging_station.total_capacity_kw). May be null. */
  capacityLimitKw: number | null;
  chargerCount: number;
  /** Sum of rated_power_kw over the station's chargers (installed charging hardware). */
  installedChargerKw: number;
  sessions: number;
  energyKwh: number;
  revenue: number;
  avgUtilizationPct: number | null;
  peakUtilizationPct: number | null;
  overloadEvents: number;
  /** Most recent capacity snapshot of all time, via view v_station_latest_capacity (ignores the date filter). */
  latestUtilizationPct: number | null;
  latestSnapshotAt: string | null;
  /** Rank by the selected metric among ALL stations (ties share a rank). Null when not sorting by a metric. */
  rank: number | null;
}

export interface RankedStation {
  rank: number;
  stationId: number;
  stationName: string;
  location: string;
  metric: RankMetric;
  metricValue: number | null;
  energyKwh: number;
  sessions: number;
  revenue: number;
}

export interface StationOption {
  stationId: number;
  stationName: string;
}

export interface ChargerRow {
  chargerId: number;
  chargerType: string;
  ratedPowerKw: number;
  status: string;
  sessions: number;
  energyKwh: number;
}

export interface CapacitySnapshot {
  capacityId: number;
  recordedAt: string;
  maxLoadKw: number;
  currentLoadKw: number;
  utilizationPct: number;
  overloadStatus: "NORMAL" | "OVERLOADED";
  overloadKw: number;
}

export interface TelemetryPoint {
  telemetryId: number;
  recordedAt: string;
  voltageV: number | null;
  currentA: number | null;
  powerKw: number | null;
  frequencyHz: number | null;
  gridLoadKw: number | null;
}

export interface Series<T> {
  rows: T[]; // newest first
  total: number; // matching rows in range (rows.length may be capped by limit)
}

// ---------- existence ----------
export async function assertStationExists(stationId: number): Promise<void> {
  const rows = await query(`SELECT 1 FROM charging_station WHERE station_id = $1`, [stationId]);
  if (rows.length === 0) throw new ApiError(404, "NOT_FOUND", "Station not found.");
}

export const listStationOptions = () =>
  query<StationOption>(
    `SELECT station_id AS "stationId", station_name AS "stationName" FROM charging_station ORDER BY station_name, station_id`,
  );

// ---------- shared metrics CTE ($1 = from, $2 = to) ----------
/*
 * One row per station with its session, capacity, charger and ranking metrics.
 * Rankings are RANK() window functions over ALL stations, computed before any search/status filter,
 * so a station keeps the same rank however the list is filtered.
 */
const METRICS_CTE = `
WITH sess AS (
  SELECT sd.station_id,
         COUNT(*)::int                   AS sessions,
         COALESCE(SUM(sd.energy_kwh), 0) AS energy,
         COALESCE(SUM(sd.cost), 0)       AS revenue
    FROM v_session_details sd
   WHERE ${rangeClause("sd.start_time", 1, 2)}
   GROUP BY sd.station_id
), cap AS (
  SELECT u.station_id,
         AVG(u.util)  AS avg_util,
         MAX(u.util)  AS peak_util,
         COUNT(*) FILTER (WHERE u.overload_status = 'OVERLOADED')::int AS overloads
    FROM (SELECT sc.station_id, sc.overload_status,
                 COALESCE(sc.utilization_pct, ROUND(sc.current_load_kw / sc.max_load_kw * 100, 2)) AS util
            FROM station_capacity sc
           WHERE ${rangeClause("sc.recorded_at", 1, 2)}) u
   GROUP BY u.station_id
), chg AS (
  SELECT station_id, COUNT(*)::int AS chargers, COALESCE(SUM(rated_power_kw), 0) AS installed_kw
    FROM charger
   GROUP BY station_id
), m AS (
  SELECT st.station_id, st.station_name, st.location, st.operating_status, st.total_capacity_kw,
         COALESCE(chg.chargers, 0)      AS chargers,
         COALESCE(chg.installed_kw, 0)  AS installed_kw,
         COALESCE(sess.sessions, 0)     AS sessions,
         COALESCE(sess.energy, 0)       AS energy,
         COALESCE(sess.revenue, 0)      AS revenue,
         ROUND(cap.avg_util, 2)         AS avg_util,
         cap.peak_util                  AS peak_util,
         COALESCE(cap.overloads, 0)     AS overloads,
         lc.utilization_pct             AS latest_util,
         lc.recorded_at                 AS latest_at,
         RANK() OVER (ORDER BY COALESCE(sess.energy, 0)    DESC)            AS rank_energy,
         RANK() OVER (ORDER BY COALESCE(sess.sessions, 0)  DESC)            AS rank_sessions,
         RANK() OVER (ORDER BY COALESCE(sess.revenue, 0)   DESC)            AS rank_revenue,
         RANK() OVER (ORDER BY cap.peak_util DESC NULLS LAST)               AS rank_utilization,
         RANK() OVER (ORDER BY COALESCE(cap.overloads, 0)  DESC)            AS rank_overloads
    FROM charging_station st
    LEFT JOIN sess ON sess.station_id = st.station_id
    LEFT JOIN cap  ON cap.station_id  = st.station_id
    LEFT JOIN chg  ON chg.station_id  = st.station_id
    LEFT JOIN v_station_latest_capacity lc ON lc.station_id = st.station_id
)`;

const SELECT_METRICS = (rankColumn: string | null) => `
SELECT m.station_id          AS "stationId",
       m.station_name        AS "stationName",
       m.location            AS location,
       m.operating_status    AS "operatingStatus",
       m.total_capacity_kw   AS "capacityLimitKw",
       m.chargers            AS "chargerCount",
       m.installed_kw        AS "installedChargerKw",
       m.sessions            AS sessions,
       m.energy              AS "energyKwh",
       m.revenue             AS revenue,
       m.avg_util            AS "avgUtilizationPct",
       m.peak_util           AS "peakUtilizationPct",
       m.overloads           AS "overloadEvents",
       m.latest_util         AS "latestUtilizationPct",
       m.latest_at           AS "latestSnapshotAt",
       ${rankColumn ? `m.${rankColumn}::int` : "NULL::int"} AS rank
  FROM m`;

// Fixed SQL fragments keyed by allowlisted values. User input only ever selects a key; it is never concatenated.
const SORT_SQL: Record<StationSort, { order: string; rank: string | null }> = {
  name: { order: "m.station_name", rank: null },
  location: { order: "m.location", rank: null },
  energy: { order: "m.energy", rank: "rank_energy" },
  sessions: { order: "m.sessions", rank: "rank_sessions" },
  revenue: { order: "m.revenue", rank: "rank_revenue" },
  utilization: { order: "m.peak_util", rank: "rank_utilization" },
  overloads: { order: "m.overloads", rank: "rank_overloads" },
};

const RANK_SQL: Record<RankMetric, { rank: string; value: string }> = {
  energy: { rank: "rank_energy", value: "m.energy" },
  sessions: { rank: "rank_sessions", value: "m.sessions" },
  revenue: { rank: "rank_revenue", value: "m.revenue" },
  utilization: { rank: "rank_utilization", value: "m.peak_util" },
  overloads: { rank: "rank_overloads", value: "m.overloads" },
};

/** Default direction: names A-Z, every numeric metric biggest first. */
const defaultOrder = (sort: StationSort): SortOrder => (sort === "name" || sort === "location" ? "asc" : "desc");

export interface StationListInput {
  from?: string;
  to?: string;
  search?: string;
  status?: StationStatus;
  sort: StationSort;
  order?: SortOrder;
  page: number;
  pageSize: number;
}

export async function listStations(input: StationListInput): Promise<Paged<StationMetrics>> {
  const pattern = likePattern(input.search);
  const status = input.status ?? null;
  const { order: orderExpr, rank } = SORT_SQL[input.sort];
  const direction = dir(input.order ?? defaultOrder(input.sort));

  const [rows, countRows] = await Promise.all([
    query<StationMetrics>(
      `${METRICS_CTE}
       ${SELECT_METRICS(rank)}
        WHERE ($3::text IS NULL OR m.station_name ILIKE $3::text OR m.location ILIKE $3::text)
          AND ($4::text IS NULL OR m.operating_status = $4::text)
        ORDER BY ${orderExpr} ${direction} NULLS LAST, m.station_id
        LIMIT $5::int OFFSET $6::int`,
      [input.from ?? null, input.to ?? null, pattern, status, input.pageSize, offsetFor(input.page, input.pageSize)],
    ),
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
         FROM charging_station st
        WHERE ($1::text IS NULL OR st.station_name ILIKE $1::text OR st.location ILIKE $1::text)
          AND ($2::text IS NULL OR st.operating_status = $2::text)`,
      [pattern, status],
    ),
  ]);
  return paged(rows, countRows[0].total, input.page, input.pageSize);
}

export async function rankStations(input: { from?: string; to?: string; metric: RankMetric; limit: number }): Promise<RankedStation[]> {
  const { rank, value } = RANK_SQL[input.metric];
  return query<RankedStation>(
    `${METRICS_CTE}
     SELECT m.${rank}::int       AS rank,
            m.station_id         AS "stationId",
            m.station_name       AS "stationName",
            m.location           AS location,
            $4::text             AS metric,
            ${value}             AS "metricValue",
            m.energy             AS "energyKwh",
            m.sessions           AS sessions,
            m.revenue            AS revenue
       FROM m
      ORDER BY m.${rank}, m.station_id
      LIMIT $3::int`,
    [input.from ?? null, input.to ?? null, input.limit, input.metric],
  );
}

/** Station summary for the detail page, or null if the station does not exist. */
export async function getStationSummary(stationId: number, range: { from?: string; to?: string }): Promise<StationMetrics | null> {
  const rows = await query<StationMetrics>(
    `${METRICS_CTE}
     ${SELECT_METRICS(null)}
      WHERE m.station_id = $3::int`,
    [range.from ?? null, range.to ?? null, stationId],
  );
  return rows[0] ?? null;
}

export async function getStationChargers(stationId: number, range: { from?: string; to?: string }): Promise<ChargerRow[]> {
  return query<ChargerRow>(
    `SELECT ch.charger_id AS "chargerId", ch.charger_type AS "chargerType", ch.rated_power_kw AS "ratedPowerKw",
            ch.status AS status,
            COALESCE(s.sessions, 0) AS sessions, COALESCE(s.energy, 0) AS "energyKwh"
       FROM charger ch
       LEFT JOIN (SELECT sd.charger_id, COUNT(*)::int AS sessions, SUM(sd.energy_kwh) AS energy
                    FROM v_session_details sd
                   WHERE ${rangeClause("sd.start_time", 1, 2)}
                   GROUP BY sd.charger_id) s ON s.charger_id = ch.charger_id
      WHERE ch.station_id = $3::int
      ORDER BY ch.charger_id`,
    [range.from ?? null, range.to ?? null, stationId],
  );
}

/** Capacity snapshots (Station_Capacity): measured load vs permitted load. Newest first, capped at `limit`. */
export async function getStationCapacityHistory(
  stationId: number,
  input: { from?: string; to?: string; limit: number },
): Promise<Series<CapacitySnapshot>> {
  const params = [input.from ?? null, input.to ?? null, stationId];
  const [rows, counted] = await Promise.all([
    query<CapacitySnapshot>(
    `SELECT sc.capacity_id AS "capacityId", sc.recorded_at AS "recordedAt",
            sc.max_load_kw AS "maxLoadKw", sc.current_load_kw AS "currentLoadKw",
            COALESCE(sc.utilization_pct, ROUND(sc.current_load_kw / sc.max_load_kw * 100, 2)) AS "utilizationPct",
            sc.overload_status AS "overloadStatus",
            GREATEST(ROUND(sc.current_load_kw - sc.max_load_kw, 2), 0) AS "overloadKw"
       FROM station_capacity sc
      WHERE sc.station_id = $3::int AND ${rangeClause("sc.recorded_at", 1, 2)}
      ORDER BY sc.recorded_at DESC, sc.capacity_id DESC
      LIMIT $4::int`,
    [...params, input.limit],
    ),
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM station_capacity sc
        WHERE sc.station_id = $3::int AND ${rangeClause("sc.recorded_at", 1, 2)}`,
      params,
    ),
  ]);
  return { rows, total: counted[0].total };
}

/** Grid telemetry readings (Grid_Telemetry): electrical measurements. Newest first, capped at `limit`. */
export async function getStationTelemetry(
  stationId: number,
  input: { from?: string; to?: string; limit: number },
): Promise<Series<TelemetryPoint>> {
  const params = [input.from ?? null, input.to ?? null, stationId];
  const [rows, counted] = await Promise.all([
    query<TelemetryPoint>(
    `SELECT gt.telemetry_id AS "telemetryId", gt.recorded_at AS "recordedAt",
            gt.voltage_v AS "voltageV", gt.current_a AS "currentA", gt.power_kw AS "powerKw",
            gt.frequency_hz AS "frequencyHz", gt.grid_load_kw AS "gridLoadKw"
       FROM grid_telemetry gt
      WHERE gt.station_id = $3::int AND ${rangeClause("gt.recorded_at", 1, 2)}
      ORDER BY gt.recorded_at DESC, gt.telemetry_id DESC
      LIMIT $4::int`,
    [...params, input.limit],
    ),
    query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM grid_telemetry gt
        WHERE gt.station_id = $3::int AND ${rangeClause("gt.recorded_at", 1, 2)}`,
      params,
    ),
  ]);
  return { rows, total: counted[0].total };
}
