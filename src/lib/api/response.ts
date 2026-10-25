import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getEnv } from "@/lib/env";
import { ApiError, toPublicError } from "@/lib/api/errors";
import { assertSameOrigin, isSafeMethod } from "@/lib/auth/csrf";
import { requireApiUser } from "@/lib/auth/dal";
import type { Role, SessionUser } from "@/lib/auth/constants";

/** Every successful response has this shape: { ok: true, data, meta }. */
export interface ApiMeta {
  source: "postgresql";
  dataMode: "demo" | "production";
  generatedAt: string; // ISO-8601 UTC; when the server produced this response
}

export function ok<T>(data: T, init?: ResponseInit): Response {
  const meta: ApiMeta = {
    source: "postgresql",
    dataMode: getEnv().DATA_MODE,
    generatedAt: new Date().toISOString(),
  };
  return Response.json({ ok: true, data, meta }, init);
}

/** Every failure has this shape: { ok: false, error: { code, message, details? } }. */
export function fail(err: unknown): Response {
  const { status, ...error } = toPublicError(err);
  return Response.json({ ok: false, error }, { status });
}

/** Wraps a handler body so any thrown error becomes a safe JSON response. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    // Let Next.js internal control-flow errors (prerender bail-out, redirect, notFound) through.
    unstable_rethrow(err);
    return fail(err);
  }
}

/**
 * handle() plus authentication and authorization. Order matters:
 *   1. CSRF origin check for state-changing methods (403)
 *   2. valid session required (401)
 *   3. role must be at least minRole (403)
 * Responses are marked private/no-store so proxies and browsers never cache user data.
 */
export async function handleAuthed(
  request: Request,
  minRole: Role,
  fn: (user: SessionUser) => Promise<Response>,
): Promise<Response> {
  const response = await handle(async () => {
    if (!isSafeMethod(request.method)) assertSameOrigin(request);
    const user = await requireApiUser(request, minRole);
    return fn(user);
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

const MAX_BODY_CHARS = 10_000;

/** Reads a small JSON body; invalid or oversized bodies become clean 400/413 errors. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw new ApiError(413, "BODY_TOO_LARGE", "Request body is too large.");
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}
