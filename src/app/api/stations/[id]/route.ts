import { ApiError } from "@/lib/api/errors";
import { handleAuthed, ok } from "@/lib/api/response";
import { getStationChargers, getStationSummary } from "@/lib/db/queries/stations";
import { queryParams } from "@/lib/validation/params";
import { StationDetailQuerySchema, StationIdSchema } from "@/lib/validation/listing";

/**
 * GET /api/stations/[id]?from=&to=   (Analyst+)
 * Station summary (metrics respect from/to) plus its chargers. 200 | 400 bad id/dates | 401 | 404 | 503
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ANALYST", async () => {
    const id = StationIdSchema.parse((await ctx.params).id);
    const range = StationDetailQuerySchema.parse(queryParams(request));
    const station = await getStationSummary(id, range);
    if (!station) throw new ApiError(404, "NOT_FOUND", "Station not found.");
    return ok({ station, chargers: await getStationChargers(id, range) });
  });
}
