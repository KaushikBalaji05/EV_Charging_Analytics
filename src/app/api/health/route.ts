import { handle, ok } from "@/lib/api/response";
import { userFromRequest } from "@/lib/auth/dal";
import { query } from "@/lib/db/pool";

/**
 * GET /api/health
 *  Anyone:  { database: "connected" }  (503 if the database is down)
 *  ADMIN:   additionally latency and which migrations are applied (internal detail, so not public).
 */
export async function GET(request: Request) {
  return handle(async () => {
    const started = Date.now();
    const [row] = await query<{ views: boolean; capTrigger: boolean; authTables: boolean; adminTrigger: boolean }>(
      `SELECT to_regclass('public.v_overload_events') IS NOT NULL AS views,
              EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_station_capacity_compute') AS "capTrigger",
              (to_regclass('public.app_user') IS NOT NULL AND to_regclass('public.auth_session') IS NOT NULL) AS "authTables",
              EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_protect_last_admin') AS "adminTrigger"`,
    );
    const latencyMs = Date.now() - started;

    // Identify the caller only if migration 003 exists; health must never fail because of auth.
    let isAdmin = false;
    if (row.authTables) {
      try {
        isAdmin = (await userFromRequest(request))?.role === "ADMIN";
      } catch {
        isAdmin = false;
      }
    }
    if (!isAdmin) return ok({ database: "connected" });
    return ok({
      database: "connected",
      latencyMs,
      migration002: { views: row.views, trigger: row.capTrigger },
      migration003: { tables: row.authTables, trigger: row.adminTrigger },
    });
  });
}
