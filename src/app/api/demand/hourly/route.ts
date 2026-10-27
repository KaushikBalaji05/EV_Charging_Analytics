import { handleAuthed, ok } from "@/lib/api/response";
import { getHourly } from "@/lib/db/queries/demand";
import { queryParams } from "@/lib/validation/params";
import { DemandQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/demand/hourly?station_id=&from=YYYY-MM-DD&to=YYYY-MM-DD   (all optional; Analyst+)
 * Energy per hour of day (0-23). Each session's energy is split across the hours it spans.
 * 200 -> { ok, data: [{ hour, energyKwh, sessions }] (24 rows) } | 400 invalid params | 401 | 404 unknown station | 503
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ANALYST", async () => ok(await getHourly(DemandQuerySchema.parse(queryParams(request)))));
}
