import "server-only";
import pg from "pg";
import { getEnv } from "@/lib/env";

// OIDs from PostgreSQL's catalog
const OID_INT8 = 20; // BIGINT / BIGSERIAL
const OID_NUMERIC = 1700;
const OID_TIMESTAMP = 1114; // TIMESTAMP WITHOUT TIME ZONE

/**
 * Per-pool type parsers (not global):
 *  - TIMESTAMP stays a plain 'YYYY-MM-DD HH:MM:SS' string. pg's default turns it into a JS Date
 *    interpreted in the *server's* time zone, which would silently shift stored values.
 *  - NUMERIC and BIGINT arrive as strings by default; convert to numbers for charts and maths.
 */
const types = {
  getTypeParser(oid: number, format?: "text" | "binary") {
    if (oid === OID_TIMESTAMP) return (v: string) => v;
    if (oid === OID_NUMERIC || oid === OID_INT8) return (v: string) => Number(v);
    return pg.types.getTypeParser(oid, format as "text");
  },
} as unknown as pg.ClientConfig["types"];

const globalForPool = globalThis as unknown as { __evPool?: pg.Pool };

/** One pool per server process (reused across hot reloads in development). */
export function getPool(): pg.Pool {
  if (!globalForPool.__evPool) {
    const env = getEnv();
    const pool = new pg.Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
      max: 10,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 15_000,
      types,
    });
    // An idle client error must not crash the process.
    pool.on("error", (err) => console.error("[pg] idle client error:", (err as { code?: string }).code ?? err.name));
    globalForPool.__evPool = pool;
  }
  return globalForPool.__evPool;
}

/** Parameterized query helper. Values are ALWAYS passed separately from the SQL text. */
export async function query<T extends pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}
