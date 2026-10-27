import "server-only";
import { redirect, unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/dal";
import type { SessionUser } from "@/lib/auth/constants";

export type PageAuth = { ok: true; user: SessionUser } | { ok: false; message: string };

/**
 * Server-side authentication for pages (the proxy redirect is only a convenience).
 *  - not signed in      -> redirect to /login
 *  - database problem   -> { ok: false, message } so the page can show a safe error panel
 * Call it inside the page's <Suspense> content component, before reading any data.
 */
export async function pageAuth(): Promise<PageAuth> {
  let user: SessionUser | null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    unstable_rethrow(err);
    return { ok: false, message: toPublicError(err).message };
  }
  if (!user) redirect("/login");
  return { ok: true, user };
}

/** Station dropdown options for filter forms; an empty list (not an error) if the database is unreachable. */
export async function safeStationOptions() {
  const { listStationOptions } = await import("@/lib/db/queries/stations");
  try {
    return await listStationOptions();
  } catch (err) {
    unstable_rethrow(err);
    return [];
  }
}
