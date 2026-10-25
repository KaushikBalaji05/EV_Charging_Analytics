import { ApiError } from "@/lib/api/errors";
import { handle, ok, readJson } from "@/lib/api/response";
import { assertSameOrigin } from "@/lib/auth/csrf";
import { authenticate } from "@/lib/auth/login";
import { buildSessionCookie } from "@/lib/auth/session";
import { LoginSchema } from "@/lib/validation/auth";

/**
 * POST /api/auth/login   body: { email, password }
 * 200 -> { ok: true, data: { user } } and sets the HttpOnly session cookie
 * 400 -> malformed body / invalid email format
 * 401 -> INVALID_CREDENTIALS. The SAME response for unknown email, wrong password,
 *        disabled account and locked account, so accounts cannot be enumerated.
 * 403 -> cross-origin request
 */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const { email, password } = LoginSchema.parse(await readJson(request));
    const result = await authenticate(email, password);
    if (!result) {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password, or the account is temporarily locked.");
    }
    return ok(
      { user: result.user },
      { headers: { "Set-Cookie": buildSessionCookie(result.token), "Cache-Control": "no-store" } },
    );
  });
}
