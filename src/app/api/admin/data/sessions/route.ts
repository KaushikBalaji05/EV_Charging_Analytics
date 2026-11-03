import { handleAuthed, ok, readJson } from "@/lib/api/response";
import { insertChargingSession } from "@/lib/db/queries/data-admin";
import { CreateSessionSchema } from "@/lib/validation/data-admin";

/**
 * POST /api/admin/data/sessions
 * Protected (ADMIN only)
 * Creates a new charging session record in PostgreSQL Charging_Session.
 */
export async function POST(request: Request) {
  return handleAuthed(request, "ADMIN", async (user) => {
    const body = await readJson(request);
    const validated = CreateSessionSchema.parse(body);

    const result = await insertChargingSession(validated);

    console.info(`[admin-audit] Admin #${user.userId} (${user.email}) registered charging session #${result.sessionId} (Station #${validated.station_id}, Charger #${validated.charger_id})`);

    return ok({
      message: `Charging session #${result.sessionId} created successfully.`,
      sessionId: result.sessionId,
    });
  });
}
