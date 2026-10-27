import { handleAuthed, ok } from "@/lib/api/response";
import { getDaily } from "@/lib/db/queries/demand";
import { queryParams } from "@/lib/validation/params";
import { DemandQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/demand/daily?station_id=&from=&to=   (all optional; Analyst+)
 * Energy, sessions and revenue per day (attributed to the day a session started) plus a 7-day moving average.
 * Days without sessions are included as zeros. 200 | 400 | 401 | 404 unknown station | 503
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ANALYST", async () => ok(await getDaily(DemandQuerySchema.parse(queryParams(request)))));
}
