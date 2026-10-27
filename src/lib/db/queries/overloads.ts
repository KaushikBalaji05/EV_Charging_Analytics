import "server-only";
import { query } from "@/lib/db/pool";
import { dir, offsetFor, paged, rangeClause, type Paged } from "@/lib/db/queries/shared";
import { assertStationExists } from "@/lib/db/queries/stations";
import type { OverloadSort, SortOrder } from "@/lib/validation/listing";

/** How far (either side) to look for a telemetry reading to show beside a capacity snapshot. */
export const TELEMETRY_MATCH_MINUTES = 15;

export interface OverloadRow {
  /** Capacity snapshot (Station_Capacity) */
  capacityId: number;
  stationId: number;
  stationName: string;
  location: string;
  recordedAt: string;
  currentLoadKw: number;
  maxLoadKw: number;
  /** Not capped: 105 means 105% of permitted load. */
  utilizationPct: number;
  overloadKw: number;
  /** Nearest telemetry reading (Grid_Telemetry) within the match window, if any. A separate measurement. */
  telemetryAt: string | null;
  telemetryGridLoadKw: number | null;
}

export interface OverloadSummary {
  events: number;
  stations: number;
  peakUtilizationPct: number | null;
  maxOverloadKw: number | null;
}

export interface OverloadList extends Paged<OverloadRow> {
  summary: OverloadSummary;
}

const SORT_SQL: Record<OverloadSort, string> = {
  time: "e.recorded_at",
  utilization: "e.utilization_pct",
  overload: "e.overload_kw",
};

export interface OverloadInput {
  from?: string;
  to?: string;
  stationId?: number;
  sort: OverloadSort;
  order?: SortOrder;
  page: number;
  pageSize: number;
}

/**
 * Overloaded capacity snapshots from view v_overload_events (migration 002).
 * Each row also carries the nearest grid-telemetry reading (LATERAL join: one indexed lookup per overload row)
 * so the two different data sources can be compared without being confused.
 */
export async function listOverloads(input: OverloadInput): Promise<OverloadList> {
  if (input.stationId !== undefined) await assertStationExists(input.stationId);
  const filterParams = [input.from ?? null, input.to ?? null, input.stationId ?? null];
  const where = `${rangeClause("e.recorded_at", 1, 2)} AND ($3::int IS NULL OR e.station_id = $3::int)`;
  const direction = dir(input.order ?? "desc");

  const [rows, [summary]] = await Promise.all([
    query<OverloadRow>(
      `SELECT e.capacity_id AS "capacityId", e.station_id AS "stationId", e.station_name AS "stationName",
              e.location AS location, e.recorded_at AS "recordedAt",
              e.current_load_kw AS "currentLoadKw", e.max_load_kw AS "maxLoadKw",
              e.utilization_pct AS "utilizationPct", e.overload_kw AS "overloadKw",
              t.recorded_at AS "telemetryAt", t.grid_load_kw AS "telemetryGridLoadKw"
         FROM v_overload_events e
         LEFT JOIN LATERAL (
                SELECT gt.recorded_at, gt.grid_load_kw
                  FROM grid_telemetry gt
                 WHERE gt.station_id = e.station_id
                   AND gt.recorded_at BETWEEN e.recorded_at - make_interval(mins => $4::int)
                                          AND e.recorded_at + make_interval(mins => $4::int)
                 ORDER BY ABS(EXTRACT(EPOCH FROM (gt.recorded_at - e.recorded_at))), gt.telemetry_id
                 LIMIT 1) t ON TRUE
        WHERE ${where}
        ORDER BY ${SORT_SQL[input.sort]} ${direction}, e.capacity_id
        LIMIT $5::int OFFSET $6::int`,
      [...filterParams, TELEMETRY_MATCH_MINUTES, input.pageSize, offsetFor(input.page, input.pageSize)],
    ),
    query<OverloadSummary>(
      `SELECT COUNT(*)::int AS events, COUNT(DISTINCT e.station_id)::int AS stations,
              MAX(e.utilization_pct) AS "peakUtilizationPct", MAX(e.overload_kw) AS "maxOverloadKw"
         FROM v_overload_events e
        WHERE ${where}`,
      filterParams,
    ),
  ]);
  return { ...paged(rows, summary.events, input.page, input.pageSize), summary };
}
