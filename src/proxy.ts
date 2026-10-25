import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Convenience redirect ONLY: visitors with no session cookie are sent to /login.
 * This is NOT a security boundary. It cannot tell a real session from a forged cookie.
 * Real authentication and authorization happen in the Data Access Layer
 * (src/lib/auth/dal.ts), against the database, on every protected page and API call.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const login = new URL("/login", request.url);
  const target = request.nextUrl.pathname + request.nextUrl.search;
  if (target !== "/") login.searchParams.set("next", target);
  return NextResponse.redirect(login);
}

export const config = {
  // Pages only: API routes answer 401 themselves; /login and static assets stay public.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
