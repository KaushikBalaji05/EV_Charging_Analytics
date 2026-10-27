import { handleAuthed, ok } from "@/lib/api/response";
import { assertStationExists, getStationCapacityHistory } from "@/lib/db/queries/stations";
import { queryParams } from "@/lib/validation/params";
import { StationIdSchema, StationSeriesQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/stations/[id]/capacity?from=&to=&limit=200   (Analyst+)
 * Capacity snapshots (measured load vs permitted load), newest first. utilizationPct is not capped at 100.
 * These are NOT telemetry readings: see /telemetry. 200 | 400 | 401 | 404 | 503
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ANALYST", async () => {
    const id = StationIdSchema.parse((await ctx.params).id);
    const q = StationSeriesQuerySchema.parse(queryParams(request));
    await assertStationExists(id);
    return ok(await getStationCapacityHistory(id, q));
  });
}
