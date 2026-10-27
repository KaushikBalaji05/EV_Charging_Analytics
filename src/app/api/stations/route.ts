import { handleAuthed, ok } from "@/lib/api/response";
import { listStations } from "@/lib/db/queries/stations";
import { queryParams } from "@/lib/validation/params";
import { StationListQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/stations?q=&status=&sort=&order=&from=&to=&page=&page_size=   (Analyst+)
 * sort: name | location | energy | sessions | revenue | utilization | overloads (default energy, biggest first)
 * status: ACTIVE | INACTIVE | MAINTENANCE.  page_size 1-100 (default 20).
 * Session and utilization metrics respect from/to. 200 -> { rows, total, page, pageSize, totalPages } | 400 | 401 | 503
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ANALYST", async () => ok(await listStations(StationListQuerySchema.parse(queryParams(request)))));
}
