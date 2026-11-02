import { handleAuthed, ok } from "@/lib/api/response";
import { getDataEntryOptions } from "@/lib/db/queries/data-admin";

/**
 * GET /api/admin/data/options
 * Protected (ADMIN only)
 * Returns stations, chargers, and EVs for controlled data entry dropdown menus.
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const options = await getDataEntryOptions();
    return ok(options);
  });
}
