import { handleAuthed, ok, readJson } from "@/lib/api/response";
import { EntityIdParamSchema, UpdateChargerStatusSchema } from "@/lib/validation/data-admin";
import {
  getChargerDependencies,
  deactivateCharger,
  reactivateCharger,
  deleteCharger,
} from "@/lib/db/queries/station-management";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/data/chargers/[id]
 * Protected (ADMIN only)
 * Returns charger dependencies, count breakdown, and deletion eligibility.
 */
export async function GET(request: Request, ctx: RouteContext) {
  return handleAuthed(request, "ADMIN", async () => {
    const rawParams = await ctx.params;
    const chargerId = EntityIdParamSchema.parse(rawParams.id);

    const dependencies = await getChargerDependencies(chargerId);
    return ok(dependencies);
  });
}

/**
 * PATCH /api/admin/data/chargers/[id]
 * Protected (ADMIN only)
 * Deactivates or reactivates an individual charger.
 */
export async function PATCH(request: Request, ctx: RouteContext) {
  return handleAuthed(request, "ADMIN", async (user) => {
    const rawParams = await ctx.params;
    const chargerId = EntityIdParamSchema.parse(rawParams.id);

    const body = await readJson(request);
    const validated = UpdateChargerStatusSchema.parse(body);

    if (validated.status === "INACTIVE") {
      const result = await deactivateCharger(chargerId, user.userId);
      return ok({
        message: `Charger #${result.chargerId} successfully deactivated.`,
        charger: result,
      });
    } else {
      const result = await reactivateCharger(chargerId, user.userId);
      return ok({
        message: `Charger #${result.chargerId} successfully reactivated (status set to AVAILABLE).`,
        charger: result,
      });
    }
  });
}

/**
 * DELETE /api/admin/data/chargers/[id]
 * Protected (ADMIN only)
 * Permanently deletes a charger ONLY if it has zero dependent charging sessions.
 * Returns HTTP 409 Conflict if historical sessions exist.
 */
export async function DELETE(request: Request, ctx: RouteContext) {
  return handleAuthed(request, "ADMIN", async (user) => {
    const rawParams = await ctx.params;
    const chargerId = EntityIdParamSchema.parse(rawParams.id);

    const result = await deleteCharger(chargerId, user.userId);
    return ok({
      message: `Charger #${result.chargerId} permanently deleted.`,
      result,
    });
  });
}
