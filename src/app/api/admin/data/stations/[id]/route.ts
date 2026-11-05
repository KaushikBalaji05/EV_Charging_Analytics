import { handleAuthed, ok, readJson } from "@/lib/api/response";
import { EntityIdParamSchema, UpdateStationStatusSchema } from "@/lib/validation/data-admin";
import {
  getStationDependencies,
  deactivateStation,
  reactivateStation,
  deleteStation,
} from "@/lib/db/queries/station-management";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/data/stations/[id]
 * Protected (ADMIN only)
 * Returns station dependencies, count breakdown, and deletion eligibility.
 */
export async function GET(request: Request, ctx: RouteContext) {
  return handleAuthed(request, "ADMIN", async () => {
    const rawParams = await ctx.params;
    const stationId = EntityIdParamSchema.parse(rawParams.id);

    const dependencies = await getStationDependencies(stationId);
    return ok(dependencies);
  });
}

/**
 * PATCH /api/admin/data/stations/[id]
 * Protected (ADMIN only)
 * Deactivates or reactivates an operational charging station.
 */
export async function PATCH(request: Request, ctx: RouteContext) {
  return handleAuthed(request, "ADMIN", async (user) => {
    const rawParams = await ctx.params;
    const stationId = EntityIdParamSchema.parse(rawParams.id);

    const body = await readJson(request);
    const validated = UpdateStationStatusSchema.parse(body);

    if (validated.status === "INACTIVE") {
      const result = await deactivateStation(stationId, user.userId);
      return ok({
        message: `Station #${result.stationId} ('${result.stationName}') successfully deactivated.`,
        station: result,
      });
    } else {
      const result = await reactivateStation(stationId, user.userId);
      return ok({
        message: `Station #${result.stationId} ('${result.stationName}') successfully reactivated.`,
        station: result,
      });
    }
  });
}

/**
 * DELETE /api/admin/data/stations/[id]
 * Protected (ADMIN only)
 * Permanently deletes a charging station ONLY if it has zero dependent records.
 * Returns HTTP 409 Conflict if chargers, sessions, capacity, or telemetry exist.
 */
export async function DELETE(request: Request, ctx: RouteContext) {
  return handleAuthed(request, "ADMIN", async (user) => {
    const rawParams = await ctx.params;
    const stationId = EntityIdParamSchema.parse(rawParams.id);

    const result = await deleteStation(stationId, user.userId);
    return ok({
      message: `Station #${result.stationId} ('${result.stationName}') permanently deleted.`,
      result,
    });
  });
}
