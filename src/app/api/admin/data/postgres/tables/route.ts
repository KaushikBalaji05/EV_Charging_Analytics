import { handleAuthed, ok } from "@/lib/api/response";
import { query } from "@/lib/db/pool";
import { ALLOWED_PG_TABLES as ALLOWLIST } from "@/lib/db/queries/data-admin";

/**
 * GET /api/admin/data/postgres/tables
 * Protected (ADMIN only)
 * Lists all allowlisted PostgreSQL tables and views with their record counts.
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const tableStats = await Promise.all(
      ALLOWLIST.map(async (tableName) => {
        try {
          const res = await query<{ count: number }>(`SELECT count(*)::int AS count FROM "${tableName}"`);
          return {
            table: tableName,
            count: res[0]?.count ?? 0,
            isView: tableName.startsWith("v_"),
          };
        } catch {
          return {
            table: tableName,
            count: 0,
            isView: tableName.startsWith("v_"),
          };
        }
      })
    );

    return ok({ tables: tableStats });
  });
}
