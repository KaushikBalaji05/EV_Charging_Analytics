import { handleAuthed, ok } from "@/lib/api/response";
import { StationIdSchema } from "@/lib/validation/listing";
import { assertStationExists } from "@/lib/db/queries/stations";
import { getExternalStationMetadata } from "@/lib/services/external-metadata";
import {
  getStationLiveTelemetryWithAggregates,
  StationLiveTelemetryResult,
} from "@/lib/db/queries/telemetry-mongo";
import { getRegionalGridContext } from "@/lib/services/regional-grid";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Math.min(Math.max(parseInt(v, 10) || 30, 5), 100) : 30)),
});

const DEFAULT_UNAVAILABLE_TELEMETRY: StationLiveTelemetryResult = {
  status: "unavailable",
  isLive: false,
  ageSeconds: null,
  error: "MongoDB telemetry service temporarily unavailable",
  latest: null,
  history: [],
  stats: {
    avgVoltage: null,
    avgFrequency: null,
    avgPowerKw: null,
    maxPowerKw: null,
    avgGridLoadKw: null,
    maxGridLoadKw: null,
    sampleCount: 0,
  },
};

/**
 * GET /api/stations/[id]/hybrid-summary?limit=30  (Analyst+)
 * Unified hybrid data endpoint providing:
 *  1. Relational verification: confirms station exists in PostgreSQL (throws 404 if not)
 *  2. Real Station Metadata: Open Charge Map -> source: "open_charge_map_curated"
 *  3. Live / Historical Electrical Telemetry: MongoDB -> source: "simulated"
 *  4. Regional Transmission Grid Context: CEA India -> source: "central_electricity_authority"
 *
 * Implements fault-tolerant degradation so partial outages in one source do not fail others.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ANALYST", async () => {
    const id = StationIdSchema.parse((await ctx.params).id);
    // 1. Verify existence against PostgreSQL master table
    await assertStationExists(id);

    const url = new URL(request.url);
    const { limit } = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    // 2. Fetch external metadata, telemetry and regional grid in parallel with fault tolerance
    const [metadataRes, telemetryRes, gridRes] = await Promise.allSettled([
      getExternalStationMetadata(id),
      getStationLiveTelemetryWithAggregates(id, limit),
      getRegionalGridContext(),
    ]);

    const externalMetadata = metadataRes.status === "fulfilled" ? metadataRes.value : null;
    const liveTelemetry =
      telemetryRes.status === "fulfilled" ? telemetryRes.value : DEFAULT_UNAVAILABLE_TELEMETRY;
    const regionalGrid = gridRes.status === "fulfilled" ? gridRes.value : null;

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
