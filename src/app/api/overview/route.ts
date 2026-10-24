import { handle, ok } from "@/lib/api/response";
import { OverviewQuerySchema } from "@/lib/validation/overview";
import { getOverview } from "@/lib/db/queries/overview";

/**
 * GET /api/overview?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Query params (both optional, inclusive): from, to
 * 200 -> { ok: true, data: Overview, meta }
 * 400 -> invalid date format / from > to / range too long
 * 503 -> database unavailable
 */
export async function GET(request: Request) {
  return handle(async () => {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const range = OverviewQuerySchema.parse(params);
    return ok(await getOverview(range));
  });
}
