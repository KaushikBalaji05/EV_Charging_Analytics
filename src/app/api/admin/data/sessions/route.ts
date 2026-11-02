import { handleAuthed, ok } from "@/lib/api/response";
import { insertChargingSession } from "@/lib/db/queries/data-admin";
import { CreateSessionSchema } from "@/lib/validation/data-admin";

/**
 * POST /api/admin/data/sessions
 * Protected (ADMIN only)
 * Creates a new charging session record in PostgreSQL Charging_Session.
 */
export async function POST(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const body = await request.json();
    const validated = CreateSessionSchema.parse(body);

    const result = await insertChargingSession(validated);

    return ok({
      message: `Charging session #${result.sessionId} created successfully.`,
      sessionId: result.sessionId,
    });
  });
}
