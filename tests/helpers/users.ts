/**
 * Shared helpers for integration tests that call the real route handlers.
 * Test users have emails like test+<random>@example.test and random passwords, and are removed by cleanupTestUsers().
 */
import { randomBytes } from "node:crypto";
import { getPool, query } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { POST as loginPOST } from "@/app/api/auth/login/route";

export const HOST = "localhost:3000";
export const ORIGIN = `http://${HOST}`;
const TEST_EMAIL_LIKE = "test+%@example.test";

export interface TestUser { userId: number; email: string; password: string }

export function req(path: string, opts: { method?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: HOST, ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = `ev_session=${opts.cookie}`;
  return new Request(`${ORIGIN}${path}`, { method: opts.method ?? "GET", headers });
}

export async function makeTestUser(role: "ADMIN" | "ANALYST"): Promise<TestUser> {
  const email = `test+${randomBytes(6).toString("hex")}@example.test`;
  const password = `Pw-${randomBytes(12).toString("base64url")}`;
  const rows = await query<{ userId: number }>(
    `INSERT INTO app_user (email, display_name, role, password_hash) VALUES ($1, 'Test User', $2, $3) RETURNING user_id AS "userId"`,
    [email, role, await hashPassword(password)],
  );
  return { userId: rows[0].userId, email, password };
}

export async function sessionTokenFor(u: TestUser): Promise<string> {
  const res = await loginPOST(
    new Request(`${ORIGIN}/api/auth/login`, {
      method: "POST",
      headers: { host: HOST, "content-type": "application/json" },
      body: JSON.stringify({ email: u.email, password: u.password }),
    }),
  );
  if (res.status !== 200) throw new Error(`test login failed with ${res.status}`);
  return /ev_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";
}

/**
 * Removes only rows created by tests.
 *
 * Happy path: a plain DELETE inside a transaction succeeds whenever at least one
 * non-test ADMIN already exists in the database (the normal setup). No DDL is run.
 *
 * Fallback (test admins are the only admins): the last-admin trigger blocks the
 * plain DELETE, so we fall back to a DDL disable/enable pair on a dedicated
 * connection. The ENABLE is in a finally block so it runs even if the DELETE fails.
 */
export async function cleanupTestUsers(): Promise<void> {
  // --- happy path ---
  const client = await getPool().connect();
  let needsFallback = false;
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_LIKE]);
    await client.query("COMMIT");
    return;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    needsFallback = (err as { code?: string }).code === "EV001";
    if (!needsFallback) {
      // Unexpected error: make accounts unusable as a last resort.
      await client.query("UPDATE app_user SET password_hash = '!', is_active = false WHERE email LIKE $1", [TEST_EMAIL_LIKE]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
  if (!needsFallback) return;

  // --- fallback: test admins are the only admins in this database ---
  // DISABLE/ENABLE TRIGGER cannot be rolled back, so we use a dedicated connection
  // and put ENABLE TRIGGER in a finally block to guarantee it always re-fires.
  const c2 = await getPool().connect();
  try {
    await c2.query("ALTER TABLE app_user DISABLE TRIGGER trg_protect_last_admin");
    await c2.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_LIKE]);
  } catch {
    await c2.query("UPDATE app_user SET password_hash = '!', is_active = false WHERE email LIKE $1", [TEST_EMAIL_LIKE]).catch(() => undefined);
  } finally {
    await c2.query("ALTER TABLE app_user ENABLE TRIGGER trg_protect_last_admin").catch(() => undefined);
    c2.release();
  }
}
