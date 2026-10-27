import { handleAuthed, ok } from "@/lib/api/response";
import { assertStationExists, getStationTelemetry } from "@/lib/db/queries/stations";
import { queryParams } from "@/lib/validation/params";
import { StationIdSchema, StationSeriesQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/stations/[id]/telemetry?from=&to=&limit=200   (Analyst+)
 * Grid telemetry readings (voltage, current, power, frequency, grid load), newest first, at most `limit` (1-1000).
 * `meta.dataMode` says whether the dataset is demo/synthetic. 200 | 400 | 401 | 404 | 503
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ANALYST", async () => {
    const id = StationIdSchema.parse((await ctx.params).id);
    const q = StationSeriesQuerySchema.parse(queryParams(request));
    await assertStationExists(id);
    return ok(await getStationTelemetry(id, q));
  });
}
