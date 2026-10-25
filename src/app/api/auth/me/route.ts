import { handleAuthed, ok } from "@/lib/api/response";

/** GET /api/auth/me -> the signed-in user (401 if not signed in). */
export async function GET(request: Request) {
  return handleAuthed(request, "ANALYST", async (user) => ok({ user }));
}
