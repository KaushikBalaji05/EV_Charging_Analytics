import "server-only";
import { query } from "@/lib/db/pool";

export interface RangeInput {
  from?: string;
  to?: string;
  stationId?: number;
}

export interface OverviewKpis {
  totalSessions: number;
  ongoingSessions: number;
  totalEnergyKwh: number;
  totalRevenue: number;
  capacitySnapshots: number;
  avgUtilizationPct: number | null;
  peakUtilizationPct: number | null;
  overloadEvents: number;
  overloadedStations: number;
}

export interface HourlyDemandPoint {
  hour: number; // 0-23, hour of day (stored wall-clock time)
  energyKwh: number;
  sessions: number;
}

export interface StationComparison {
  stationId: number;
  stationName: string;
  operatingStatus: string;
  capacityKw: number | null;
  sessions: number;
  energyKwh: number;
  revenue: number;
  avgUtilizationPct: number | null;
  peakUtilizationPct: number | null;
  overloadEvents: number;
}

export interface OverloadEvent {
  capacityId: number;
  stationId: number;
  stationName: string;
  recordedAt: string;
  currentLoadKw: number;
  maxLoadKw: number;
  utilizationPct: number;
  overloadKw: number;
}

export interface TelemetryReading {
  telemetryId: number;
  stationId: number;
  stationName: string;
  recordedAt: string;
  voltageV: number | null;
  currentA: number | null;
  powerKw: number | null;
  frequencyHz: number | null;
  gridLoadKw: number | null;
}

export interface Overview {
  range: { from: string | null; to: string | null };
  kpis: OverviewKpis;
  hourly: HourlyDemandPoint[];
  stations: StationComparison[];
  recentOverloads: OverloadEvent[];
  recentTelemetry: TelemetryReading[];
  freshness: { latestTelemetryAt: string | null; latestCapacityAt: string | null };
}

/*
 * Date filter convention used by every query below ($1 = from, $2 = to, both optional):
 *   col >= $1::date                -> from the START of the 'from' day
 *   col <  $2::date + 1            -> up to and INCLUDING the whole 'to' day
 * A NULL parameter disables that bound, so no SQL string is ever built from user input.
 */
const SESSION_RANGE = `($1::date IS NULL OR cs.start_time >= $1::date)
                   AND ($2::date IS NULL OR cs.start_time <  $2::date + 1)`;
const CAPACITY_RANGE = `($1::date IS NULL OR sc.recorded_at >= $1::date)
                    AND ($2::date IS NULL OR sc.recorded_at <  $2::date + 1)`;

export async function getKpis(from?: string, to?: string): Promise<OverviewKpis> {
  const [sessions] = await query<Pick<OverviewKpis, "totalSessions" | "ongoingSessions" | "totalEnergyKwh" | "totalRevenue">>(
    `SELECT COUNT(*)::int                                  AS "totalSessions",
            COUNT(*) FILTER (WHERE cs.end_time IS NULL)::int AS "ongoingSessions",
            COALESCE(SUM(cs.energy_kwh), 0)                AS "totalEnergyKwh",
            COALESCE(SUM(cs.cost), 0)                      AS "totalRevenue"
       FROM charging_session cs
      WHERE ${SESSION_RANGE}`,
    [from ?? null, to ?? null],
  );

  const [capacity] = await query<Pick<OverviewKpis, "capacitySnapshots" | "avgUtilizationPct" | "peakUtilizationPct" | "overloadEvents" | "overloadedStations">>(
    `SELECT COUNT(*)::int                                                       AS "capacitySnapshots",
            ROUND(AVG(u.util), 2)                                               AS "avgUtilizationPct",
            MAX(u.util)                                                         AS "peakUtilizationPct",
            COUNT(*) FILTER (WHERE u.overload_status = 'OVERLOADED')::int       AS "overloadEvents",
            COUNT(DISTINCT u.station_id) FILTER (WHERE u.overload_status = 'OVERLOADED')::int AS "overloadedStations"
       FROM (SELECT sc.station_id, sc.overload_status,
                    COALESCE(sc.utilization_pct, ROUND(sc.current_load_kw / sc.max_load_kw * 100, 2)) AS util
               FROM station_capacity sc
              WHERE ${CAPACITY_RANGE}) u`,
    [from ?? null, to ?? null],
  );

  return { ...sessions, ...capacity };
}

/**
 * Hour-of-day demand. Each session's energy is spread across the hours it actually
 * spans, in proportion to the minutes spent in each hour (a 2h session is not
 * counted entirely in its start hour). Sessions with no end_time (ongoing) or zero
 * duration are attributed entirely to their start hour.
 */
export async function getHourlyDemand({ from, to, stationId }: RangeInput): Promise<HourlyDemandPoint[]> {
  const rows = await query<HourlyDemandPoint>(
    `WITH s AS (
        SELECT cs.session_id, cs.start_time,
               COALESCE(cs.end_time, cs.start_time) AS end_eff,
               cs.energy_kwh
          FROM charging_session cs
          JOIN charger c ON c.charger_id = cs.charger_id
         WHERE ${SESSION_RANGE}
           AND ($3::int IS NULL OR c.station_id = $3::int)
     ), b AS (
        SELECT s.*, h AS bucket
          FROM s
          CROSS JOIN LATERAL generate_series(date_trunc('hour', s.start_time),
                                             date_trunc('hour', s.end_eff),
                                             interval '1 hour') AS h
     )
     SELECT EXTRACT(HOUR FROM bucket)::int AS hour,
            ROUND(SUM(CASE WHEN end_eff = start_time THEN energy_kwh
                           ELSE energy_kwh
                                * EXTRACT(EPOCH FROM (LEAST(end_eff, bucket + interval '1 hour') - GREATEST(start_time, bucket)))
                                / EXTRACT(EPOCH FROM (end_eff - start_time))
                      END), 2) AS "energyKwh",
            COUNT(DISTINCT session_id) FILTER (
                WHERE end_eff = start_time
                   OR LEAST(end_eff, bucket + interval '1 hour') > GREATEST(start_time, bucket)
            )::int AS sessions
       FROM b
      GROUP BY 1
      ORDER BY 1`,
    [from ?? null, to ?? null, stationId ?? null],
  );
  // Return all 24 hours so charts have a stable axis.
  const byHour = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, hour) => byHour.get(hour) ?? { hour, energyKwh: 0, sessions: 0 });
}

export async function getStationComparison(from?: string, to?: string): Promise<StationComparison[]> {
  return query<StationComparison>(
    `WITH sess AS (
        SELECT c.station_id, COUNT(*)::int AS sessions,
               SUM(cs.energy_kwh) AS energy, SUM(cs.cost) AS revenue
          FROM charging_session cs
          JOIN charger c ON c.charger_id = cs.charger_id
         WHERE ${SESSION_RANGE}
         GROUP BY c.station_id
     ), cap AS (
        SELECT u.station_id, AVG(u.util) AS avg_util, MAX(u.util) AS peak_util,
               COUNT(*) FILTER (WHERE u.overload_status = 'OVERLOADED')::int AS overloads
          FROM (SELECT sc.station_id, sc.overload_status,
                       COALESCE(sc.utilization_pct, ROUND(sc.current_load_kw / sc.max_load_kw * 100, 2)) AS util
                  FROM station_capacity sc
                 WHERE ${CAPACITY_RANGE}) u
         GROUP BY u.station_id
     )
     SELECT st.station_id                         AS "stationId",
            st.station_name                       AS "stationName",
            st.operating_status                   AS "operatingStatus",
            st.total_capacity_kw                  AS "capacityKw",
            COALESCE(sess.sessions, 0)            AS sessions,
            COALESCE(sess.energy, 0)              AS "energyKwh",
            COALESCE(sess.revenue, 0)             AS revenue,
            ROUND(cap.avg_util, 2)                AS "avgUtilizationPct",
            cap.peak_util                         AS "peakUtilizationPct",
            COALESCE(cap.overloads, 0)            AS "overloadEvents"
       FROM charging_station st
       LEFT JOIN sess ON sess.station_id = st.station_id
       LEFT JOIN cap  ON cap.station_id  = st.station_id
      ORDER BY "energyKwh" DESC, st.station_id`,
    [from ?? null, to ?? null],
  );
}

/** Capacity snapshots flagged OVERLOADED (reads the v_overload_events view from migration 002). */
export async function getRecentOverloads(from?: string, to?: string, limit = 5): Promise<OverloadEvent[]> {
  return query<OverloadEvent>(
    `SELECT capacity_id AS "capacityId", station_id AS "stationId", station_name AS "stationName",
            recorded_at AS "recordedAt", current_load_kw AS "currentLoadKw", max_load_kw AS "maxLoadKw",
            utilization_pct AS "utilizationPct", overload_kw AS "overloadKw"
       FROM v_overload_events
      WHERE ($1::date IS NULL OR recorded_at >= $1::date)
        AND ($2::date IS NULL OR recorded_at <  $2::date + 1)
      ORDER BY recorded_at DESC, capacity_id DESC
      LIMIT $3::int`,
    [from ?? null, to ?? null, limit],
  );
}

export async function getRecentTelemetry(from?: string, to?: string, limit = 5): Promise<TelemetryReading[]> {
  return query<TelemetryReading>(
    `SELECT gt.telemetry_id AS "telemetryId", gt.station_id AS "stationId", st.station_name AS "stationName",
            gt.recorded_at AS "recordedAt", gt.voltage_v AS "voltageV", gt.current_a AS "currentA",
            gt.power_kw AS "powerKw", gt.frequency_hz AS "frequencyHz", gt.grid_load_kw AS "gridLoadKw"
       FROM grid_telemetry gt
       JOIN charging_station st ON st.station_id = gt.station_id
      WHERE ($1::date IS NULL OR gt.recorded_at >= $1::date)
        AND ($2::date IS NULL OR gt.recorded_at <  $2::date + 1)
      ORDER BY gt.recorded_at DESC, gt.telemetry_id DESC
      LIMIT $3::int`,
    [from ?? null, to ?? null, limit],
  );
}

export async function getFreshness(): Promise<Overview["freshness"]> {
  const [row] = await query<Overview["freshness"]>(
    `SELECT (SELECT MAX(recorded_at) FROM grid_telemetry)  AS "latestTelemetryAt",
            (SELECT MAX(recorded_at) FROM station_capacity) AS "latestCapacityAt"`,
  );
  return row;
}

export async function getOverview(range: { from?: string; to?: string }): Promise<Overview> {
  const { from, to } = range;
  const [kpis, hourly, stations, recentOverloads, recentTelemetry, freshness] = await Promise.all([
    getKpis(from, to),
    getHourlyDemand({ from, to }),
    getStationComparison(from, to),
    getRecentOverloads(from, to),
    getRecentTelemetry(from, to),
    getFreshness(),
  ]);
  return { range: { from: from ?? null, to: to ?? null }, kpis, hourly, stations, recentOverloads, recentTelemetry, freshness };
}
