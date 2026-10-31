import { handleAuthed, ok } from "@/lib/api/response";
import { StationIdSchema } from "@/lib/validation/listing";
import { getExternalStationMetadata } from "@/lib/services/external-metadata";
import { getStationLiveTelemetryWithAggregates } from "@/lib/db/queries/telemetry-mongo";
import { getRegionalGridContext } from "@/lib/services/regional-grid";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10) || 30, 5), 100) : 30)),
});

/**
 * GET /api/stations/[id]/hybrid-summary?limit=30  (Analyst+)
 * Unified hybrid data endpoint providing:
 *  1. Real Station Metadata (Open Charge Map) -> source: "open_charge_map"
 *  2. Simulated Live Electrical Telemetry (MongoDB) -> source: "simulated"
 *  3. Regional Transmission Grid Context (CEA India) -> source: "central_electricity_authority"
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ANALYST", async () => {
    const id = StationIdSchema.parse((await ctx.params).id);
    const url = new URL(request.url);
    const { limit } = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const [externalMetadata, liveTelemetry, regionalGrid] = await Promise.all([
      getExternalStationMetadata(id),
      getStationLiveTelemetryWithAggregates(id, limit),
      getRegionalGridContext(),
    ]);

    return ok(
      {
        localStationId: id,
        externalMetadata,
        liveTelemetry,
        regionalGrid,
        sourceSummary: {
          metadataSource: externalMetadata?.externalSource ?? "open_charge_map_curated",
          telemetrySource: "simulated",
          gridContextSource: "central_electricity_authority",
        },
      },
      undefined,
      { source: "hybrid" },
    );
  });
}
