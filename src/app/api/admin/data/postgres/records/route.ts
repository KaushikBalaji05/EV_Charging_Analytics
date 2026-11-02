import { handleAuthed, ok } from "@/lib/api/response";
import { queryTableRecords, serializeToCsv } from "@/lib/db/queries/data-admin";
import { z } from "zod";

const QueryParamsSchema = z.object({
  table: z.string().min(1, "Table name is required"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  export: z.enum(["csv", "json"]).optional().default("json"),
});

/**
 * GET /api/admin/data/postgres/records?table=...&page=1&limit=20&search=...&export=csv
 * Protected (ADMIN only)
 * Returns paginated table records or CSV download with strict allowlist validation.
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const url = new URL(request.url);
    const parsed = QueryParamsSchema.parse(Object.fromEntries(url.searchParams.entries()));

    const result = await queryTableRecords({
      table: parsed.table,
      page: parsed.page,
      limit: parsed.limit,
      search: parsed.search,
      sortBy: parsed.sortBy,
      sortOrder: parsed.sortOrder,
    });

    if (parsed.export === "csv") {
      const csv = serializeToCsv(result.rows);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${parsed.table}_export.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return ok(result);
  });
}
