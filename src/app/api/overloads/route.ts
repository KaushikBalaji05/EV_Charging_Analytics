import { handleAuthed, ok } from "@/lib/api/response";
import { listOverloads } from "@/lib/db/queries/overloads";
import { queryParams } from "@/lib/validation/params";
import { OverloadQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/overloads?station_id=&from=&to=&sort=time&order=desc&page=1&page_size=20   (Analyst+)
 * Overloaded capacity snapshots (view v_overload_events): load, permitted load, utilization % (above 100 allowed)
 * and overload kW, each with the nearest telemetry reading (+/-15 min) for comparison.
 * sort: time | utilization | overload.  200 -> { rows, total, page, pageSize, totalPages, summary } | 400 | 401 | 404 | 503
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ANALYST", async () => ok(await listOverloads(OverloadQuerySchema.parse(queryParams(request)))));
}
