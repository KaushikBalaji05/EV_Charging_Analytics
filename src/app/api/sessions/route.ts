import { handleAuthed, ok } from "@/lib/api/response";
import { listSessions } from "@/lib/db/queries/sessions";
import { queryParams } from "@/lib/validation/params";
import { SessionQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/sessions?station_id=&charger_id=&q=&status=all&from=&to=&sort=start&order=desc&page=1&page_size=20   (Analyst+)
 * q matches vehicle registration, model or station name. status: all | ongoing | completed.
 * sort: start | energy | cost | duration | peak. Ongoing sessions have endTime = null and durationMinutes = null.
 * 200 -> { rows, total, page, pageSize, totalPages, totals } | 400 | 401 | 404 unknown station | 503
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ANALYST", async () => ok(await listSessions(SessionQuerySchema.parse(queryParams(request)))));
}
