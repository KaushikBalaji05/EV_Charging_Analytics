/**
 * Integration tests for authentication and authorization. They call the REAL route handlers
 * against the REAL PostgreSQL database in DATABASE_URL (migrations 002 and 003 must be applied).
 *
 * Safety: every row these tests create has an email like test+<random>@example.test and a random
 * password, and is deleted afterwards. Nothing else in app_user is read or modified, except the
 * transaction-wrapped last-admin test, which is always rolled back.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query } from "@/lib/db/pool";
import { hashPassword } from "@/lib/auth/password";
import { hashToken } from "@/lib/auth/session";
import { AUTH } from "@/lib/config";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { GET as meGET } from "@/app/api/auth/me/route";
import { GET as usersGET, POST as usersPOST } from "@/app/api/admin/users/route";
import { PATCH as userPATCH } from "@/app/api/admin/users/[id]/route";
import { GET as overviewGET } from "@/app/api/overview/route";
import { GET as healthGET } from "@/app/api/health/route";

const hasDb = Boolean(process.env.DATABASE_URL);
const HOST = "localhost:3000";
const ORIGIN = `http://${HOST}`;
const TEST_EMAIL_LIKE = "test+%@example.test";

interface TestUser { userId: number; email: string; password: string }

function req(path: string, opts: { method?: string; cookie?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: HOST, ...(opts.headers ?? {}) };
  if (opts.cookie) headers.cookie = `ev_session=${opts.cookie}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}

const json = async (res: Response) => JSON.parse(await res.text());
const tokenFrom = (res: Response) => /ev_session=([^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";
const randomEmail = () => `test+${randomBytes(6).toString("hex")}@example.test`;

async function makeUser(role: "ADMIN" | "ANALYST", extra: { active?: boolean } = {}): Promise<TestUser> {
  const email = randomEmail();
  const password = `Pw-${randomBytes(12).toString("base64url")}`;
  const rows = await query<{ userId: number }>(
    `INSERT INTO app_user (email, display_name, role, password_hash, is_active)
     VALUES ($1, 'Test User', $2, $3, $4) RETURNING user_id AS "userId"`,
    [email, role, await hashPassword(password), extra.active ?? true],
  );
  return { userId: rows[0].userId, email, password };
}

async function login(u: Pick<TestUser, "email" | "password">) {
  return loginPOST(req("/api/auth/login", { method: "POST", body: { email: u.email, password: u.password } }));
}
async function sessionFor(u: TestUser): Promise<string> {
  const res = await login(u);
  expect(res.status).toBe(200);
  return tokenFrom(res);
}

/** Removes only rows this suite created.
 *
 * Happy path: plain DELETE works whenever at least one non-test ADMIN exists in the DB.
 * Fallback: if the last-admin trigger (EV001) fires, we fall back to the DDL disable/enable
 * pair on a dedicated connection, with ENABLE TRIGGER in a finally block so it always runs.
 */
async function cleanup() {
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
      console.warn("[tests] could not delete test users; making them unusable instead");
      await client.query("UPDATE app_user SET password_hash = '!', is_active = false WHERE email LIKE $1", [TEST_EMAIL_LIKE]).catch(() => undefined);
    }
  } finally {
    client.release();
  }
  if (!needsFallback) return;

  // Fallback: test admins are the only admins — must disable the guard temporarily.
  const c2 = await getPool().connect();
  try {
    await c2.query("ALTER TABLE app_user DISABLE TRIGGER trg_protect_last_admin");
    await c2.query("DELETE FROM app_user WHERE email LIKE $1", [TEST_EMAIL_LIKE]);
  } catch {
    console.warn("[tests] could not delete test users; making them unusable instead");
    await c2.query("UPDATE app_user SET password_hash = '!', is_active = false WHERE email LIKE $1", [TEST_EMAIL_LIKE]).catch(() => undefined);
  } finally {
    await c2.query("ALTER TABLE app_user ENABLE TRIGGER trg_protect_last_admin").catch(() => undefined);
    c2.release();
  }
}

describe.skipIf(!hasDb)("authentication & authorization (real handlers, real database)", () => {
  let admin: TestUser;
  let analyst: TestUser;
  let adminToken: string;
  let analystToken: string;

  beforeAll(async () => {
    const [{ ok }] = await query<{ ok: boolean }>(`SELECT to_regclass('public.app_user') IS NOT NULL AS ok`);
    if (!ok) throw new Error("Migration 003 is not applied. Run database/migrations/003_users_and_sessions.sql first.");
    await cleanup(); // remove leftovers from any earlier crashed run
    admin = await makeUser("ADMIN");
    analyst = await makeUser("ANALYST");
    adminToken = await sessionFor(admin);
    analystToken = await sessionFor(analyst);
  });
  afterAll(async () => {
    await cleanup();
    await getPool().end();
  });

  describe("login", () => {
    it("succeeds with correct credentials: returns the user, sets a hardened cookie, no hash in the body", async () => {
      const u = await makeUser("ANALYST");
      const res = await login(u);
      const text = await res.clone().text();
      const body = JSON.parse(text);
      expect(res.status).toBe(200);
      expect(body.data.user).toMatchObject({ email: u.email, role: "ANALYST" });
      expect(text).not.toMatch(/password|argon2|hash/i);
      const cookie = res.headers.get("set-cookie") ?? "";
      for (const attr of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=28800"]) expect(cookie).toContain(attr);
    });

    it("stores only the SHA-256 of the token in the database, never the token itself", async () => {
      const u = await makeUser("ANALYST");
      const token = await sessionFor(u);
      const rows = await query<{ tokenHash: string }>(`SELECT token_hash AS "tokenHash" FROM auth_session WHERE user_id = $1`, [u.userId]);
      expect(rows).toHaveLength(1);
      expect(rows[0].tokenHash.trim()).toBe(hashToken(token));
      expect(rows[0].tokenHash).not.toContain(token);
    });

    it("rejects a wrong password and an unknown email with the IDENTICAL error (no account enumeration)", async () => {
      const wrongPw = await login({ email: analyst.email, password: "definitely-not-the-password" });
      const unknown = await login({ email: randomEmail(), password: "definitely-not-the-password" });
      expect(wrongPw.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect((await json(wrongPw)).error).toEqual((await json(unknown)).error);
      expect(wrongPw.headers.get("set-cookie")).toBeNull();
    });

    it("rejects a deactivated account even with the right password", async () => {
      const u = await makeUser("ANALYST", { active: false });
      const res = await login(u);
      expect(res.status).toBe(401);
      expect((await json(res)).error.code).toBe("INVALID_CREDENTIALS");
    });

    it("locks the account after 5 failures (even the right password fails), then recovers after the lock expires", async () => {
      const u = await makeUser("ANALYST");
      for (let i = 0; i < 5; i++) expect((await login({ email: u.email, password: "wrong-password-xx" })).status).toBe(401);
      expect((await login(u)).status).toBe(401); // correct password, but locked
      const [locked] = await query<{ locked: boolean }>(`SELECT locked_until > now() AS locked FROM app_user WHERE user_id = $1`, [u.userId]);
      expect(locked.locked).toBe(true);
      // F5: counter must stay at the threshold — not reset to 0 — at the moment of lockout.
      // Before the F1 fix this was 0 (reset on lock), giving attackers a free fresh window after each expiry.
      const [{ count }] = await query<{ count: number }>(`SELECT failed_login_count AS count FROM app_user WHERE user_id = $1`, [u.userId]);
      expect(count).toBeGreaterThanOrEqual(AUTH.maxFailedLogins);

      await query(`UPDATE app_user SET locked_until = now() - interval '1 minute' WHERE user_id = $1`, [u.userId]); // simulate 15 minutes passing
      expect((await login(u)).status).toBe(200);
      const [after] = await query<{ failed: number; lockedUntil: string | null }>(
        `SELECT failed_login_count AS failed, locked_until AS "lockedUntil" FROM app_user WHERE user_id = $1`, [u.userId]);
      expect(after.failed).toBe(0);
      expect(after.lockedUntil).toBeNull();
    });

    it("validates input: malformed JSON, bad email, SQL-injection-style email, empty password -> 400, tables intact", async () => {
      const raw = await loginPOST(new Request(`${ORIGIN}/api/auth/login`, { method: "POST", headers: { host: HOST }, body: "{not json" }));
      expect(raw.status).toBe(400);
      for (const body of [
        { email: "nope", password: "x" },
        { email: "x'; DROP TABLE app_user;--", password: "x" },
        { email: "a@example.test", password: "" },
      ]) {
        expect((await loginPOST(req("/api/auth/login", { method: "POST", body }))).status).toBe(400);
      }
      const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM app_user`);
      expect(n).toBeGreaterThan(0);
    });

    it("returns 413 when the request body exceeds the 10 000-character limit", async () => {
      // F6: readJson() enforces a MAX_BODY_CHARS cap to prevent memory exhaustion.
      const res = await loginPOST(
        new Request(`${ORIGIN}/api/auth/login`, {
          method: "POST",
          headers: { host: HOST, "content-type": "application/json" },
          body: "x".repeat(10_001),
        }),
      );
      expect(res.status).toBe(413);
      const body = await json(res);
      expect(body.error.code).toBe("BODY_TOO_LARGE");
      // Must not leak any internal detail.
      expect(JSON.stringify(body)).not.toMatch(/select|pg_|stack|at .*\.ts/i);
    });

    it("blocks cross-origin login attempts (CSRF)", async () => {
      const res = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: analyst.email, password: analyst.password }, headers: { origin: "http://evil.example" } }));
      expect(res.status).toBe(403);
      expect((await json(res)).error.code).toBe("CROSS_ORIGIN");
      const ok = await loginPOST(req("/api/auth/login", { method: "POST", body: { email: analyst.email, password: analyst.password }, headers: { origin: ORIGIN } }));
      expect(ok.status).toBe(200);
    });
  });

  describe("sessions", () => {
    it("/api/auth/me: 401 with no cookie, 401 with a forged cookie, 200 with a real one", async () => {
      expect((await meGET(req("/api/auth/me"))).status).toBe(401);
      expect((await meGET(req("/api/auth/me", { cookie: "A".repeat(43) }))).status).toBe(401);
      const res = await meGET(req("/api/auth/me", { cookie: analystToken }));
      expect(res.status).toBe(200);
      expect((await json(res)).data.user.email).toBe(analyst.email);
    });

    it("logout revokes the session on the server and clears the cookie", async () => {
      const u = await makeUser("ANALYST");
      const token = await sessionFor(u);
      expect((await meGET(req("/api/auth/me", { cookie: token }))).status).toBe(200);
      const out = await logoutPOST(req("/api/auth/logout", { method: "POST", cookie: token }));
      expect(out.status).toBe(200);
      expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
      expect((await meGET(req("/api/auth/me", { cookie: token }))).status).toBe(401); // the old cookie is now useless
      const rows = await query(`SELECT 1 FROM auth_session WHERE token_hash = $1`, [hashToken(token)]);
      expect(rows).toHaveLength(0);
    });

    it("rejects an expired session", async () => {
      const u = await makeUser("ANALYST");
      const token = await sessionFor(u);
      await query(`UPDATE auth_session SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' WHERE token_hash = $1`, [hashToken(token)]);
      expect((await meGET(req("/api/auth/me", { cookie: token }))).status).toBe(401);
    });
  });

  describe("route protection and role enforcement", () => {
    it("/api/overview: 401 anonymous; 200 for analyst with unchanged Stage 2 numbers", async () => {
      expect((await overviewGET(req("/api/overview"))).status).toBe(401);
      const res = await overviewGET(req("/api/overview", { cookie: analystToken }));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      const { data } = await json(res);
      expect(data.kpis).toMatchObject({ totalSessions: 3, totalEnergyKwh: 75, totalRevenue: 900, overloadEvents: 1, peakUtilizationPct: 105 });
    });

    it("/api/overview still validates input for signed-in users", async () => {
      expect((await overviewGET(req("/api/overview?from=2026-02-31", { cookie: analystToken }))).status).toBe(400);
    });

    it("admin endpoints: 401 anonymous, 403 analyst, 200 admin", async () => {
      expect((await usersGET(req("/api/admin/users"))).status).toBe(401);
      const denied = await usersGET(req("/api/admin/users", { cookie: analystToken }));
      expect(denied.status).toBe(403);
      expect((await json(denied)).error.code).toBe("FORBIDDEN");
      expect((await usersGET(req("/api/admin/users", { cookie: adminToken }))).status).toBe(200);
    });

    it("an analyst cannot create or modify users (403) and nothing is changed", async () => {
      const email = randomEmail();
      const create = await usersPOST(req("/api/admin/users", { method: "POST", cookie: analystToken, body: { email, displayName: "X", role: "ADMIN", password: "a-long-enough-password" } }));
      expect(create.status).toBe(403);
      expect(await query(`SELECT 1 FROM app_user WHERE email = $1`, [email])).toHaveLength(0);

      const patch = await userPATCH(req(`/api/admin/users/${analyst.userId}`, { method: "PATCH", cookie: analystToken, body: { role: "ADMIN" } }), { params: Promise.resolve({ id: String(analyst.userId) }) });
      expect(patch.status).toBe(403);
      const [{ role }] = await query<{ role: string }>(`SELECT role FROM app_user WHERE user_id = $1`, [analyst.userId]);
      expect(role).toBe("ANALYST");
    });

    it("blocks cross-origin state changes even with a valid admin cookie (CSRF)", async () => {
      const email = randomEmail();
      const res = await usersPOST(req("/api/admin/users", { method: "POST", cookie: adminToken, headers: { origin: "http://evil.example" }, body: { email, displayName: "X", role: "ANALYST", password: "a-long-enough-password" } }));
      expect(res.status).toBe(403);
      expect(await query(`SELECT 1 FROM app_user WHERE email = $1`, [email])).toHaveLength(0);
    });

    it("/api/health: anonymous and analyst see only connectivity; admin also sees migration detail", async () => {
      const anon = await json(await healthGET(req("/api/health")));
      expect(anon.data).toEqual({ database: "connected" });
      const asAnalyst = await json(await healthGET(req("/api/health", { cookie: analystToken })));
      expect(asAnalyst.data).toEqual({ database: "connected" });
      const asAdmin = await json(await healthGET(req("/api/health", { cookie: adminToken })));
      expect(asAdmin.data.migration003).toEqual({ tables: true, trigger: true });
      expect(asAdmin.data.migration002).toEqual({ views: true, trigger: true });
    });
  });

  describe("admin user management", () => {
    const patchReq = (id: number, body: unknown, cookie = adminToken) =>
      userPATCH(req(`/api/admin/users/${id}`, { method: "PATCH", cookie, body }), { params: Promise.resolve({ id: String(id) }) });

    it("creates a user: 201, no hash in any response, and the new user can sign in", async () => {
      const email = randomEmail();
      const password = `Pw-${randomBytes(12).toString("base64url")}`;
      const res = await usersPOST(req("/api/admin/users", { method: "POST", cookie: adminToken, body: { email: email.toUpperCase(), displayName: "New Person", role: "ANALYST", password } }));
      const text = await res.clone().text();
      expect(res.status).toBe(201);
      expect(JSON.parse(text).data.user).toMatchObject({ email, role: "ANALYST", isActive: true }); // email normalised to lower-case
      expect(text).not.toMatch(/password|argon2|hash/i);
      expect((await login({ email, password })).status).toBe(200);

      const list = await (await usersGET(req("/api/admin/users", { cookie: adminToken }))).text();
      expect(list).not.toMatch(/password|argon2|hash/i);
    });

    it("rejects duplicate email (409), weak password, bad role, and unknown fields (400)", async () => {
      const dupe = await usersPOST(req("/api/admin/users", { method: "POST", cookie: adminToken, body: { email: analyst.email.toUpperCase(), displayName: "Dup", role: "ANALYST", password: "a-long-enough-password" } }));
      expect(dupe.status).toBe(409);
      expect(JSON.stringify(await json(dupe))).not.toContain(analyst.email);

      const base = { email: randomEmail(), displayName: "X", role: "ANALYST", password: "a-long-enough-password" };
      for (const bad of [{ password: "short" }, { role: "ROOT" }, { passwordHash: "x" }, { email: "x'; DROP TABLE app_user;--" }]) {
        const res = await usersPOST(req("/api/admin/users", { method: "POST", cookie: adminToken, body: { ...base, ...bad } }));
        expect(res.status).toBe(400);
      }
    });

    it("a role change takes effect on the very next request (promotion and demotion)", async () => {
      const u = await makeUser("ANALYST");
      const token = await sessionFor(u);
      expect((await usersGET(req("/api/admin/users", { cookie: token }))).status).toBe(403);
      expect((await patchReq(u.userId, { role: "ADMIN" })).status).toBe(200);
      expect((await usersGET(req("/api/admin/users", { cookie: token }))).status).toBe(200);
      expect((await patchReq(u.userId, { role: "ANALYST" })).status).toBe(200);
      expect((await usersGET(req("/api/admin/users", { cookie: token }))).status).toBe(403);
    });

    it("deactivating a user ends their sessions immediately and blocks new logins; reactivating restores access", async () => {
      const u = await makeUser("ANALYST");
      const token = await sessionFor(u);
      expect((await patchReq(u.userId, { isActive: false })).status).toBe(200);
      expect((await meGET(req("/api/auth/me", { cookie: token }))).status).toBe(401);
      expect((await login(u)).status).toBe(401);
      expect(await query(`SELECT 1 FROM auth_session WHERE user_id = $1`, [u.userId])).toHaveLength(0);
      expect((await patchReq(u.userId, { isActive: true })).status).toBe(200);
      expect((await login(u)).status).toBe(200);
    });

    it("resetting a password revokes old sessions; only the new password works", async () => {
      const u = await makeUser("ANALYST");
      const token = await sessionFor(u);
      const newPassword = `New-${randomBytes(12).toString("base64url")}`;
      expect((await patchReq(u.userId, { password: newPassword })).status).toBe(200);
      expect((await meGET(req("/api/auth/me", { cookie: token }))).status).toBe(401);
      expect((await login(u)).status).toBe(401);
      expect((await login({ email: u.email, password: newPassword })).status).toBe(200);
    });

    it("handles bad ids, unknown users and empty/unknown fields", async () => {
      expect((await patchReq(999_999, { role: "ADMIN" })).status).toBe(404);
      const badId = await userPATCH(req("/api/admin/users/abc", { method: "PATCH", cookie: adminToken, body: { role: "ADMIN" } }), { params: Promise.resolve({ id: "abc" }) });
      expect(badId.status).toBe(400);
      expect((await patchReq(analyst.userId, {})).status).toBe(400);
      expect((await patchReq(analyst.userId, { passwordHash: "x" })).status).toBe(400);
    });
  });

  describe("database safeguards", () => {
    it("the last-administrator trigger refuses to remove, demote or deactivate the final active admin (always rolled back)", async () => {
      const client = await getPool().connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<{ user_id: number }>(`SELECT user_id FROM app_user WHERE role = 'ADMIN' AND is_active ORDER BY user_id`);
        const last = rows[rows.length - 1].user_id;
        for (const r of rows.slice(0, -1)) await client.query(`UPDATE app_user SET is_active = false WHERE user_id = $1`, [r.user_id]); // all but one: allowed
        for (const sql of [
          `UPDATE app_user SET is_active = false WHERE user_id = $1`,
          `UPDATE app_user SET role = 'ANALYST' WHERE user_id = $1`,
          `DELETE FROM app_user WHERE user_id = $1`,
        ]) {
          await client.query("SAVEPOINT attempt");
          await expect(client.query(sql, [last])).rejects.toMatchObject({ code: "EV001" });
          await client.query("ROLLBACK TO SAVEPOINT attempt");
        }
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM app_user WHERE role = 'ADMIN' AND is_active`);
      expect(n).toBeGreaterThanOrEqual(2); // our two test admins at minimum are untouched
    });

    it("CHECK constraints reject invalid roles and non-lowercase emails at the database level", async () => {
      await expect(query(`INSERT INTO app_user (email, display_name, role, password_hash) VALUES ('test+bad1@example.test','x','OWNER','x')`)).rejects.toMatchObject({ code: "23514" });
      await expect(query(`INSERT INTO app_user (email, display_name, role, password_hash) VALUES ('Test+Bad2@Example.test','x','ANALYST','x')`)).rejects.toMatchObject({ code: "23514" });
    });
  });
});
