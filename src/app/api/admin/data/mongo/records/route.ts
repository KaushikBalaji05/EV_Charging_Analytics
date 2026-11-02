import { handleAuthed, ok } from "@/lib/api/response";
import { queryMongoRecords, serializeToCsv } from "@/lib/db/queries/data-admin";
import { z } from "zod";

const QueryParamsSchema = z.object({
  collection: z.string().min(1, "Collection name is required"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  stationId: z.coerce.number().int().optional(),
  export: z.enum(["csv", "json"]).optional().default("json"),
});

/**
 * GET /api/admin/data/mongo/records?collection=...&page=1&limit=20&stationId=...&export=csv
 * Protected (ADMIN only)
 * Returns paginated documents or CSV download from allowlisted MongoDB collections.
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const url = new URL(request.url);
    const parsed = QueryParamsSchema.parse(Object.fromEntries(url.searchParams.entries()));

    const result = await queryMongoRecords({
      collection: parsed.collection,
      page: parsed.page,
      limit: parsed.limit,
      stationId: parsed.stationId,
    });

    if (parsed.export === "csv") {
      // Flatten metadata for clean tabular CSV export
      const flattened = result.documents.map((doc) => {
        const { metadata, ...rest } = doc;
        const metaObj = (typeof metadata === "object" && metadata !== null)
          ? (metadata as Record<string, unknown>)
          : {};
        return {
          ...rest,
          scenario: metaObj.scenario ?? "",
          is_overloaded: metaObj.is_overloaded ?? "",
          capacity_kw: metaObj.capacity_kw ?? "",
        };
      });

      const csv = serializeToCsv(flattened);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${parsed.collection}_export.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return ok(result);
  });
}
