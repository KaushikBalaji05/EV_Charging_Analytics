import { handleAuthed, ok } from "@/lib/api/response";
import { getMongoDb } from "@/lib/db/mongodb";
import { ALLOWED_MONGO_COLLECTIONS } from "@/lib/db/queries/data-admin";

/**
 * GET /api/admin/data/mongo/collections
 * Protected (ADMIN only)
 * Lists allowlisted MongoDB collections with document counts.
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const db = await getMongoDb();
    const collections = await Promise.all(
      ALLOWED_MONGO_COLLECTIONS.map(async (colName) => {
        const col = db.collection(colName);
        const count = await col.countDocuments();
        return {
          name: colName,
          count,
        };
      })
    );

    return ok({ collections });
  });
}
