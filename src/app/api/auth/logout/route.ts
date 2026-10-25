import { handle, ok } from "@/lib/api/response";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { buildClearCookie, readSessionToken, revokeSession } from "@/lib/auth/session";

/** POST /api/auth/logout: revokes the session server-side and clears the cookie. Always 200 (idempotent). */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const token = readSessionToken(request.headers.get("cookie"));
    if (token) await revokeSession(token);
    return ok({ loggedOut: true }, { headers: { "Set-Cookie": buildClearCookie(), "Cache-Control": "no-store" } });
  });
}
