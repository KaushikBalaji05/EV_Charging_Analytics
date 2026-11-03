import { handleAuthed, ok } from "@/lib/api/response";
import {
  getLiveTelemetryOverview,
  getRecentTelemetryTrend,
  getSimulatorInfo,
} from "@/lib/db/queries/data-admin";
import { z } from "zod";

const QuerySchema = z.object({
  stationId: z.coerce.number().int().optional(),
});

/**
 * GET /api/admin/data/telemetry/live?stationId=...
 * Protected (ADMIN only)
 * Returns latest telemetry readings per station, recent trend data, and simulator status for live monitoring.
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const url = new URL(request.url);
    const { stationId } = QuerySchema.parse(Object.fromEntries(url.searchParams.entries()));

    const [latest, trend, simulator] = await Promise.all([
      getLiveTelemetryOverview(stationId),
      getRecentTelemetryTrend(stationId, 25),
      getSimulatorInfo(),
    ]);

    return ok({ latest, trend, simulator });
  });
}
