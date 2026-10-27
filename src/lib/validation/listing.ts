import { z } from "zod";
import {
  DateRangeShape,
  checkDateRange,
  emptyToUndefined,
  optionalStationId,
  positiveInt,
} from "@/lib/validation/common";

// ---------- explicit allowlists. Anything else is rejected with 400; these keys map to fixed SQL in the query layer ----------
export const STATION_SORTS = ["name", "location", "energy", "sessions", "revenue", "utilization", "overloads"] as const;
export const RANK_METRICS = ["energy", "sessions", "revenue", "utilization", "overloads"] as const;
export const OVERLOAD_SORTS = ["time", "utilization", "overload"] as const;
export const SESSION_SORTS = ["start", "energy", "cost", "duration", "peak"] as const;
export const SESSION_STATUSES = ["all", "ongoing", "completed"] as const;
export const STATION_STATUSES = ["ACTIVE", "INACTIVE", "MAINTENANCE"] as const;

export type StationSort = (typeof STATION_SORTS)[number];
export type RankMetric = (typeof RANK_METRICS)[number];
export type OverloadSort = (typeof OVERLOAD_SORTS)[number];
export type SessionSort = (typeof SESSION_SORTS)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type StationStatus = (typeof STATION_STATUSES)[number];
export type SortOrder = "asc" | "desc";

// ---------- building blocks ----------
const blankIsMissing = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema);

const page = blankIsMissing(
  z.coerce.number().int("Must be a whole number").min(1, "Must be at least 1").max(10_000, "Page is out of range").default(1),
);
const pageSize = blankIsMissing(
  z.coerce.number().int("Must be a whole number").min(1, "Must be at least 1").max(100, "At most 100 rows per page").default(20),
);
const order = blankIsMissing(z.enum(["asc", "desc"], { error: "Order must be asc or desc" }).optional());
const search = blankIsMissing(z.string().trim().max(100, "Search text must be 100 characters or fewer").optional());
const limit = (max: number, def: number) =>
  blankIsMissing(
    z.coerce.number().int("Must be a whole number").min(1, "Must be at least 1").max(max, `At most ${max}`).default(def),
  );

/** Route segment such as /api/stations/[id]. */
export const StationIdSchema = positiveInt;

// ---------- endpoint schemas (query params are snake_case; results are camelCase) ----------

/** GET /api/demand/hourly, /api/demand/daily and the Demand page */
export const DemandQuerySchema = z
  .object({ ...DateRangeShape, station_id: optionalStationId })
  .superRefine(checkDateRange)
  .transform((v) => ({ from: v.from, to: v.to, stationId: v.station_id }));

/** GET /api/stations */
export const StationListQuerySchema = z
  .object({
    ...DateRangeShape,
    q: search,
    status: blankIsMissing(z.enum(STATION_STATUSES, { error: "Status must be ACTIVE, INACTIVE or MAINTENANCE" }).optional()),
    sort: blankIsMissing(z.enum(STATION_SORTS, { error: `Sort must be one of: ${STATION_SORTS.join(", ")}` }).default("energy")),
    order,
    page,
    page_size: pageSize,
  })
  .superRefine(checkDateRange)
  .transform((v) => ({
    from: v.from, to: v.to, search: v.q, status: v.status, sort: v.sort, order: v.order, page: v.page, pageSize: v.page_size,
  }));

/** GET /api/stations/ranking */
export const RankingQuerySchema = z
  .object({
    ...DateRangeShape,
    metric: blankIsMissing(z.enum(RANK_METRICS, { error: `Metric must be one of: ${RANK_METRICS.join(", ")}` }).default("energy")),
    limit: limit(50, 10),
  })
  .superRefine(checkDateRange)
  .transform((v) => ({ from: v.from, to: v.to, metric: v.metric, limit: v.limit }));

/** GET /api/stations/[id] */
export const StationDetailQuerySchema = z
  .object({ ...DateRangeShape })
  .superRefine(checkDateRange)
  .transform((v) => ({ from: v.from, to: v.to }));

/** GET /api/stations/[id]/telemetry and /capacity: most recent N readings in range */
export const StationSeriesQuerySchema = z
  .object({ ...DateRangeShape, limit: limit(1000, 200) })
  .superRefine(checkDateRange)
  .transform((v) => ({ from: v.from, to: v.to, limit: v.limit }));

/** GET /api/overloads (and /api/stations/[id]/overloads, where station comes from the path) */
export const OverloadQuerySchema = z
  .object({
    ...DateRangeShape,
    station_id: optionalStationId,
    sort: blankIsMissing(z.enum(OVERLOAD_SORTS, { error: `Sort must be one of: ${OVERLOAD_SORTS.join(", ")}` }).default("time")),
    order,
    page,
    page_size: pageSize,
  })
  .superRefine(checkDateRange)
  .transform((v) => ({
    from: v.from, to: v.to, stationId: v.station_id, sort: v.sort, order: v.order, page: v.page, pageSize: v.page_size,
  }));

/** GET /api/sessions */
export const SessionQuerySchema = z
  .object({
    ...DateRangeShape,
    station_id: optionalStationId,
    charger_id: optionalStationId,
    q: search,
    status: blankIsMissing(z.enum(SESSION_STATUSES, { error: "Status must be all, ongoing or completed" }).default("all")),
    sort: blankIsMissing(z.enum(SESSION_SORTS, { error: `Sort must be one of: ${SESSION_SORTS.join(", ")}` }).default("start")),
    order,
    page,
    page_size: pageSize,
  })
  .superRefine(checkDateRange)
  .transform((v) => ({
    from: v.from, to: v.to, stationId: v.station_id, chargerId: v.charger_id, search: v.q, status: v.status,
    sort: v.sort, order: v.order, page: v.page, pageSize: v.page_size,
  }));
