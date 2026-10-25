import "server-only";
import { ApiError } from "@/lib/api/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const isSafeMethod = (method: string) => SAFE_METHODS.has(method.toUpperCase());

interface OriginHeaders {
  origin: string | null;
  host: string | null;
  secFetchSite: string | null;
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests (on top of SameSite=Lax).
 *  - Browser sends Origin  -> its host must equal our Host header.
 *  - No Origin but Sec-Fetch-Site (browser) -> must be same-origin or none.
 *  - Neither header -> not a browser; CSRF needs a browser, so it is allowed (curl, tests, scripts).
 * Behind a reverse proxy, make sure the proxy forwards the original Host header.
 */
export function isSameOrigin({ origin, host, secFetchSite }: OriginHeaders): boolean {
  if (origin !== null) {
    try {
      return host !== null && new URL(origin).host === host;
    } catch {
      return false; // includes the literal Origin: "null"
    }
  }
  if (secFetchSite !== null) return secFetchSite === "same-origin" || secFetchSite === "none";
  return true;
}

export function assertSameOrigin(request: Request): void {
  const h = request.headers;
  if (!isSameOrigin({ origin: h.get("origin"), host: h.get("host"), secFetchSite: h.get("sec-fetch-site") })) {
    throw new ApiError(403, "CROSS_ORIGIN", "Cross-origin request blocked.");
  }
}
