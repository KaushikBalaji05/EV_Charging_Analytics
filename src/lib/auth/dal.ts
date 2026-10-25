import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { ApiError } from "@/lib/api/errors";
import { hasRole, SESSION_COOKIE, type Role, type SessionUser } from "@/lib/auth/constants";
import { lookupSession, readSessionToken } from "@/lib/auth/session";

/*
 * Data Access Layer: the ONE place that decides "who is this and may they do this".
 * Every protected route handler and page calls into here, on the server, against the
 * database. The proxy's cookie check is only a convenience redirect, never the security boundary.
 */

/** For Route Handlers: the user behind this request's cookie, or null. */
export async function userFromRequest(request: Request): Promise<SessionUser | null> {
  const token = readSessionToken(request.headers.get("cookie"));
  return token ? lookupSession(token) : null;
}

/** For Route Handlers: throws 401 (not logged in) or 403 (logged in but role too low). */
export async function requireApiUser(request: Request, minRole: Role): Promise<SessionUser> {
  const user = await userFromRequest(request);
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Authentication required.");
  if (!hasRole(user.role, minRole)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to perform this action.");
  }
  return user;
}

/**
 * For Server Components: the current user, or null. Reads cookies, so it is request-time data and
 * must be called inside a <Suspense> boundary. De-duplicated within one render by React cache().
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? lookupSession(token) : null;
});
