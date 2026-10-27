import "server-only";
import { query } from "@/lib/db/pool";
import { getHourlyDemand, type HourlyDemandPoint } from "@/lib/db/queries/overview";
import { rangeClause } from "@/lib/db/queries/shared";
import { assertStationExists } from "@/lib/db/queries/stations";
import { APP_CONFIG } from "@/lib/config";

export interface DemandFilter {
  from?: string;
  to?: string;
  stationId?: number;
}

export interface DemandTotals {
  sessions: number;
  ongoingSessions: number;
  energyKwh: number;
  revenue: number;
  avgEnergyPerSessionKwh: number | null;
}

export interface DailyDemandPoint {
  date: string; // YYYY-MM-DD
  sessions: number;
  energyKwh: number;
  revenue: number;
  /** Mean daily energy over this day and up to 6 preceding days (fewer at the start of the series). */
  movingAvgKwh: number;
}

export interface DailyDemand {
  points: DailyDemandPoint[];
  rangeFrom: string | null;
  rangeTo: string | null;
  /** True when the requested span exceeded the cap and only the most recent days are returned. */
  truncated: boolean;
}

export interface DemandTrend {
  windowDays: number;
  recentKwh: number;
  previousKwh: number;
  /** Percent change of the most recent window versus the window before it; null if the earlier window had no energy. */
  changePct: number | null;
}

export interface DemandAnalytics {
  filter: { from: string | null; to: string | null; stationId: number | null };
  totals: DemandTotals;
  hourly: HourlyDemandPoint[];
  daily: DailyDemand;
  peakHour: HourlyDemandPoint | null;
  peakDay: DailyDemandPoint | null;
  topHours: HourlyDemandPoint[];
  topDays: DailyDemandPoint[];
  trend: DemandTrend | null;
}

const MS_PER_DAY = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Hour-of-day demand (energy split across the hours each session spans). Validates the station if given. */
export async function getHourly(filter: DemandFilter): Promise<HourlyDemandPoint[]> {
  if (filter.stationId !== undefined) await assertStationExists(filter.stationId);
  return getHourlyDemand(filter);
}

export async function getDemandTotals(filter: DemandFilter): Promise<DemandTotals> {
  const [row] = await query<DemandTotals>(
    `SELECT COUNT(*)::int                             AS sessions,
            COUNT(*) FILTER (WHERE sd.is_ongoing)::int AS "ongoingSessions",
            COALESCE(SUM(sd.energy_kwh), 0)           AS "energyKwh",
            COALESCE(SUM(sd.cost), 0)                 AS revenue,
            ROUND(AVG(sd.energy_kwh), 2)              AS "avgEnergyPerSessionKwh"
       FROM v_session_details sd
      WHERE ${rangeClause("sd.start_time", 1, 2)}
        AND ($3::int IS NULL OR sd.station_id = $3::int)`,
    [filter.from ?? null, filter.to ?? null, filter.stationId ?? null],
  );
  return row;
}

/**
 * Day-by-day demand. Energy is attributed to the day the session STARTED.
 * Days without sessions appear as zeros so gaps are visible. The series covers the requested range;
 * an open end defaults to the first/last day that has data, and spans over 366 days keep the latest 366.
 */
export async function getDaily(filter: DemandFilter): Promise<DailyDemand> {
  if (filter.stationId !== undefined) await assertStationExists(filter.stationId);

  const [bounds] = await query<{ lo: string | null; hi: string | null }>(
    `SELECT to_char(COALESCE($1::date, MIN(sd.start_time)::date), 'YYYY-MM-DD') AS lo,
            to_char(COALESCE($2::date, MAX(sd.start_time)::date), 'YYYY-MM-DD') AS hi
       FROM v_session_details sd
      WHERE ($3::int IS NULL OR sd.station_id = $3::int)`,
    [filter.from ?? null, filter.to ?? null, filter.stationId ?? null],
  );
  if (!bounds.lo || !bounds.hi || bounds.lo > bounds.hi) {
    return { points: [], rangeFrom: bounds.lo, rangeTo: bounds.hi, truncated: false };
  }

  let lo = bounds.lo;
  const hi = bounds.hi;
  const spanDays = (toUtc(hi) - toUtc(lo)) / MS_PER_DAY + 1;
  const truncated = spanDays > APP_CONFIG.maxRangeDays;
  if (truncated) lo = fromUtc(toUtc(hi) - (APP_CONFIG.maxRangeDays - 1) * MS_PER_DAY);

  const points = await query<DailyDemandPoint>(
    `WITH days AS (
        SELECT d::date AS day
          FROM generate_series($1::date::timestamp, $2::date::timestamp, interval '1 day') AS d
     ), agg AS (
        SELECT sd.start_time::date AS day,
               COUNT(*)::int AS sessions, SUM(sd.energy_kwh) AS energy, SUM(sd.cost) AS revenue
          FROM v_session_details sd
         WHERE sd.start_time >= $1::date AND sd.start_time < $2::date + 1
           AND ($3::int IS NULL OR sd.station_id = $3::int)
         GROUP BY 1
     )
     SELECT to_char(days.day, 'YYYY-MM-DD')     AS date,
            COALESCE(agg.sessions, 0)           AS sessions,
            COALESCE(agg.energy, 0)             AS "energyKwh",
            COALESCE(agg.revenue, 0)            AS revenue,
            ROUND(AVG(COALESCE(agg.energy, 0)) OVER (ORDER BY days.day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2)
                                                AS "movingAvgKwh"
       FROM days
       LEFT JOIN agg ON agg.day = days.day
      ORDER BY days.day`,
    [lo, hi, filter.stationId ?? null],
  );
  return { points, rangeFrom: lo, rangeTo: hi, truncated };
}

/** Compares the most recent window of days with the window before it (needs at least 2 days of series). */
export function computeTrend(points: DailyDemandPoint[]): DemandTrend | null {
  if (points.length < 2) return null;
  const windowDays = Math.min(7, Math.floor(points.length / 2));
  const sum = (arr: DailyDemandPoint[]) => Math.round(arr.reduce((s, p) => s + p.energyKwh, 0) * 100) / 100;
  const recent = sum(points.slice(-windowDays));
  const previous = sum(points.slice(-2 * windowDays, -windowDays));
  return {
    windowDays,
    recentKwh: recent,
    previousKwh: previous,
    changePct: previous > 0 ? Math.round(((recent - previous) / previous) * 1000) / 10 : null,
  };
}

const topBy = <T>(items: T[], value: (t: T) => number, n = 3): T[] =>
  items.filter((i) => value(i) > 0).sort((a, b) => value(b) - value(a)).slice(0, n);

export async function getDemandAnalytics(filter: DemandFilter): Promise<DemandAnalytics> {
  if (filter.stationId !== undefined) await assertStationExists(filter.stationId);
  const [totals, hourly, daily] = await Promise.all([getDemandTotals(filter), getHourlyDemand(filter), getDaily(filter)]);
  const topHours = topBy(hourly, (h) => h.energyKwh);
  const topDays = topBy(daily.points, (d) => d.energyKwh);
  return {
    filter: { from: filter.from ?? null, to: filter.to ?? null, stationId: filter.stationId ?? null },
    totals,
    hourly,
    daily,
    peakHour: topHours[0] ?? null,
    peakDay: topDays[0] ?? null,
    topHours,
    topDays,
    trend: computeTrend(daily.points),
  };
}
