import "server-only";
import { query } from "@/lib/db/pool";
import { dir, likePattern, offsetFor, paged, rangeClause, type Paged } from "@/lib/db/queries/shared";
import { assertChargerExists, assertStationExists } from "@/lib/db/queries/stations";
import type { SessionSort, SessionStatus, SortOrder } from "@/lib/validation/listing";

export interface SessionRow {
  sessionId: number;
  evId: number;
  registrationNo: string;
  model: string;
  ownerType: string;
  stationId: number;
  stationName: string;
  chargerId: number;
  chargerType: string;
  startTime: string;
  /** Null for an ongoing session. */
  endTime: string | null;
  ongoing: boolean;
  /** Null for an ongoing session (never a negative or invented value). */
  durationMinutes: number | null;
  energyKwh: number;
  peakPowerKw: number | null;
  cost: number;
}

export interface SessionTotals {
  sessions: number;
  ongoingSessions: number;
  energyKwh: number;
  cost: number;
}

export interface SessionList extends Paged<SessionRow> {
  totals: SessionTotals;
}

// Fixed SQL keyed by allowlisted values; NULLS LAST keeps ongoing sessions out of the way when sorting by duration.
const SORT_SQL: Record<SessionSort, string> = {
  start: "sd.start_time",
  energy: "sd.energy_kwh",
  cost: "sd.cost",
  duration: "sd.duration_minutes",
  peak: "sd.peak_power_kw",
};

export interface SessionInput {
  from?: string;
  to?: string;
  stationId?: number;
  chargerId?: number;
  search?: string;
  status: SessionStatus;
  sort: SessionSort;
  order?: SortOrder;
  page: number;
  pageSize: number;
}

/** Sessions from view v_session_details (migration 004). Search matches registration number, model or station name. */
export async function listSessions(input: SessionInput): Promise<SessionList> {
  if (input.stationId !== undefined) await assertStationExists(input.stationId);
  // F7: validate charger_id against the database for consistent 404 feedback (mirrors station_id behaviour).
  if (input.chargerId !== undefined) await assertChargerExists(input.chargerId);
  const filterParams = [
    input.from ?? null,
    input.to ?? null,
    input.stationId ?? null,
    input.chargerId ?? null,
    likePattern(input.search),
    input.status,
  ];
  const where = `${rangeClause("sd.start_time", 1, 2)}
     AND ($3::int IS NULL OR sd.station_id = $3::int)
     AND ($4::int IS NULL OR sd.charger_id = $4::int)
     AND ($5::text IS NULL OR sd.registration_no ILIKE $5::text OR sd.model ILIKE $5::text OR sd.station_name ILIKE $5::text)
     AND ($6::text = 'all' OR ($6::text = 'ongoing' AND sd.is_ongoing) OR ($6::text = 'completed' AND NOT sd.is_ongoing))`;
  const direction = dir(input.order ?? "desc");

  const [rows, [totals]] = await Promise.all([
    query<SessionRow>(
      `SELECT sd.session_id AS "sessionId", sd.ev_id AS "evId", sd.registration_no AS "registrationNo",
              sd.model AS model, sd.owner_type AS "ownerType",
              sd.station_id AS "stationId", sd.station_name AS "stationName",
              sd.charger_id AS "chargerId", sd.charger_type AS "chargerType",
              sd.start_time AS "startTime", sd.end_time AS "endTime", sd.is_ongoing AS ongoing,
              sd.duration_minutes AS "durationMinutes", sd.energy_kwh AS "energyKwh",
              sd.peak_power_kw AS "peakPowerKw", sd.cost AS cost
         FROM v_session_details sd
        WHERE ${where}
        ORDER BY ${SORT_SQL[input.sort]} ${direction} NULLS LAST, sd.session_id
        LIMIT $7::int OFFSET $8::int`,
      [...filterParams, input.pageSize, offsetFor(input.page, input.pageSize)],
    ),
    query<SessionTotals>(
      `SELECT COUNT(*)::int AS sessions,
              COUNT(*) FILTER (WHERE sd.is_ongoing)::int AS "ongoingSessions",
              COALESCE(SUM(sd.energy_kwh), 0) AS "energyKwh",
              COALESCE(SUM(sd.cost), 0)       AS cost
         FROM v_session_details sd
        WHERE ${where}`,
      filterParams,
    ),
  ]);
  return { ...paged(rows, totals.sessions, input.page, input.pageSize), totals };
}
