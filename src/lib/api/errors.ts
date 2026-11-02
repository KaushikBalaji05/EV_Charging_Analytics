import "server-only";
import { ZodError } from "zod";
import { ConfigError } from "@/lib/env";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const CONNECTION_CODES = new Set([
  "ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN",
  "57P01", "57P02", "57P03", // admin shutdown / crash / cannot connect now
  "53300", // too many connections
  "28P01", "28000", // bad credentials (reported generically to the client)
]);

export function isDatabaseUnavailable(err: unknown): boolean {
  if (!err) return false;
  const name = (err as Error)?.name ?? "";
  if (
    /Mongo(ServerSelection|Network|Timeout|TopologyClosed|NotConnected)Error/i.test(name) ||
    name === "MongoError"
  ) {
    return true;
  }
  const code = (err as { code?: string })?.code;
  if (code && (CONNECTION_CODES.has(code) || code.startsWith("08"))) return true;

  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  if (causeCode && CONNECTION_CODES.has(causeCode)) return true;

  const msg = (err as Error)?.message ?? "";
  return /timeout exceeded when trying to connect|Connection terminated|Server selection timed out|topology is closed/i.test(msg);
}

export interface PublicError {
  status: number;
  code: string;
  message: string;
  details?: { field: string; message: string }[];
}

/**
 * Converts ANY thrown value into a safe, client-facing error.
 * Full detail is logged on the server only; SQL text, stack traces and
 * connection details are never returned.
 */
export function toPublicError(err: unknown): PublicError {
  if (err instanceof ApiError) return { status: err.status, code: err.code, message: err.message };
  if (err instanceof ZodError) {
    return {
      status: 400,
      code: "INVALID_INPUT",
      message: "One or more parameters are invalid.",
      details: err.issues.map((i) => ({ field: i.path.join(".") || "(root)", message: i.message })),
    };
  }
  if (err instanceof ConfigError) {
    return { status: 500, code: "CONFIGURATION_ERROR", message: "The server is not configured correctly. Check the environment variables." };
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23505") {
    return { status: 409, code: "ALREADY_EXISTS", message: "A record with these details already exists." };
  }
  if (pgCode === "EV001") {
    // Raised by trigger trg_protect_last_admin (migration 003)
    return { status: 409, code: "LAST_ADMIN", message: "There must always be at least one active administrator." };
  }
  if (isDatabaseUnavailable(err)) {
    console.error("[db] unavailable:", (err as { code?: string }).code ?? (err as Error).name);
    return { status: 503, code: "DATABASE_UNAVAILABLE", message: "The database is currently unavailable. Please try again shortly." };
  }
  console.error("[unhandled]", err);
  return { status: 500, code: "INTERNAL_ERROR", message: "Something went wrong on the server." };
}
