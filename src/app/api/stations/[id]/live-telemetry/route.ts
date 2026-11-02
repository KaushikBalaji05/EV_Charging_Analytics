import { handleAuthed, ok } from "@/lib/api/response";
import { StationIdSchema } from "@/lib/validation/listing";
import { assertStationExists } from "@/lib/db/queries/stations";
import { getStationLiveTelemetryWithAggregates } from "@/lib/db/queries/telemetry-mongo";
import { z } from "zod";

const LiveQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10) || 30, 5), 100) : 30)),
});

/**
 * GET /api/stations/[id]/live-telemetry?limit=30  (Analyst+)
 * Retrieves simulated live MongoDB telemetry feed and real-time aggregated metrics for a station.
 * Confirms station existence in PostgreSQL (returns 404 if not found).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ANALYST", async () => {
    const id = StationIdSchema.parse((await ctx.params).id);
    await assertStationExists(id);

    const url = new URL(request.url);
    const { limit } = LiveQuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const result = await getStationLiveTelemetryWithAggregates(id, limit);

    return ok(
      {
        ...result,
        source: "simulated",
        count: result.history.length,
      },
      undefined,
      { source: "mongodb" },
    );
  });
}
