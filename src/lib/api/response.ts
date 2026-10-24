import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getEnv } from "@/lib/env";
import { toPublicError } from "@/lib/api/errors";

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
