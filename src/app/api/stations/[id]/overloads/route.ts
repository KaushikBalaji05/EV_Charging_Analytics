import { handleAuthed, ok } from "@/lib/api/response";
import { listOverloads } from "@/lib/db/queries/overloads";
import { queryParams } from "@/lib/validation/params";
import { OverloadQuerySchema, StationIdSchema } from "@/lib/validation/listing";

/**
 * GET /api/stations/[id]/overloads?from=&to=&sort=&order=&page=&page_size=   (Analyst+)
 * Overload history of one station (station comes from the path). Same shape as GET /api/overloads.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleAuthed(request, "ANALYST", async () => {
    const id = StationIdSchema.parse((await ctx.params).id);
    const q = OverloadQuerySchema.parse(queryParams(request));
    return ok(await listOverloads({ ...q, stationId: id }));
  });
}
