import { handle, ok } from "@/lib/api/response";
import { query } from "@/lib/db/pool";

/** GET /api/health -> database connectivity and whether migration 002 has been applied. */
export async function GET() {
  return handle(async () => {
    const started = Date.now();
    const [row] = await query<{ views: boolean; trigger: boolean }>(
      `SELECT to_regclass('public.v_overload_events') IS NOT NULL AS views,
              EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_station_capacity_compute') AS trigger`,
    );
    return ok({
      database: "connected",
      latencyMs: Date.now() - started,
      migration002: { views: row.views, trigger: row.trigger },
    });
  });
}
