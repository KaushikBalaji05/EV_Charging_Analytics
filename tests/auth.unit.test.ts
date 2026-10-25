import { beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit"; // never connected to in this file

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { generateToken, hashToken, readSessionToken } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/auth/csrf";
import { safeNextPath } from "@/lib/auth/redirect";
import { hasRole } from "@/lib/auth/constants";
import { CreateUserSchema, LoginSchema, UpdateUserSchema } from "@/lib/validation/auth";
import { toPublicError } from "@/lib/api/errors";

describe("password hashing", () => {
  let stored: string;
  beforeAll(async () => {
    stored = await hashPassword("correct horse battery staple");
  });
  it("uses Argon2id and never contains the plaintext", () => {
    expect(stored.startsWith("$argon2id$")).toBe(true);
    expect(stored).not.toContain("correct horse");
  });
  it("salts: hashing the same password twice gives different hashes", async () => {
    expect(await hashPassword("correct horse battery staple")).not.toBe(stored);
  });
  it("accepts the right password and rejects a wrong one", async () => {
    expect(await verifyPassword(stored, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(stored, "correct horse battery stapler")).toBe(false);
  });
  it("returns false (does not throw) for a malformed stored hash", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false);
    expect(await verifyPassword("!", "anything")).toBe(false);
  });
});

describe("session tokens", () => {
  it("are 256-bit base64url and unique", () => {
    const seen = new Set(Array.from({ length: 500 }, generateToken));
    expect(seen.size).toBe(500);
    for (const t of seen) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("are stored only as a deterministic SHA-256 hex digest", () => {
    const t = generateToken();
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
  });
  it("are read from a Cookie header regardless of other cookies", () => {
    expect(readSessionToken("a=1; ev_session=abc; b=2")).toBe("abc");
    expect(readSessionToken("ev_session=abc")).toBe("abc");
    expect(readSessionToken("other=1")).toBeNull();
    expect(readSessionToken("xev_session=abc")).toBeNull();
    expect(readSessionToken(null)).toBeNull();
    expect(readSessionToken("ev_session=")).toBeNull();
  });
});

describe("session cookie attributes", () => {
  it("is HttpOnly, SameSite=Lax, path-wide, 8h, and not Secure in development", async () => {
    vi.resetModules();
    vi.stubEnv("COOKIE_SECURE", "false");
    const { buildSessionCookie } = await import("@/lib/auth/session");
    const c = buildSessionCookie("tok");
    expect(c).toContain("ev_session=tok");
    for (const attr of ["HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=28800"]) expect(c).toContain(attr);
    expect(c).not.toContain("Secure");
    vi.unstubAllEnvs();
  });
  it("adds Secure when configured, and the clearing cookie expires immediately", async () => {
    vi.resetModules();
    vi.stubEnv("COOKIE_SECURE", "true");
    const { buildSessionCookie, buildClearCookie } = await import("@/lib/auth/session");
    expect(buildSessionCookie("tok")).toContain("Secure");
    expect(buildClearCookie()).toContain("Max-Age=0");
    vi.unstubAllEnvs();
  });
});

describe("CSRF origin check", () => {
  const host = "app.example";
  it.each([
    ["same Origin", { origin: "http://app.example", host, secFetchSite: null }, true],
    ["different Origin", { origin: "http://evil.example", host, secFetchSite: null }, false],
    ["Origin 'null'", { origin: "null", host, secFetchSite: null }, false],
    ["Origin but no Host", { origin: "http://app.example", host: null, secFetchSite: null }, false],
    ["no Origin, browser says cross-site", { origin: null, host, secFetchSite: "cross-site" }, false],
    ["no Origin, browser says same-site", { origin: null, host, secFetchSite: "same-site" }, false],
    ["no Origin, browser says same-origin", { origin: null, host, secFetchSite: "same-origin" }, true],
    ["non-browser client (no headers)", { origin: null, host, secFetchSite: null }, true],
  ])("%s", (_name, headers, expected) => {
    expect(isSameOrigin(headers)).toBe(expected);
  });
});

describe("post-login redirect safety", () => {
  it.each([
    ["/", "/"],
    ["/stations?sort=energy", "/stations?sort=energy"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
    ["/login", "/"],
    ["/api/admin/users", "/"],
    ["/ok\r\nSet-Cookie: x=1", "/"],
    ["", "/"],
    [null, "/"],
  ])("%j -> %j", (input, expected) => {
    expect(safeNextPath(input as string | null)).toBe(expected);
  });
});

describe("role hierarchy", () => {
  it("admin satisfies both; analyst satisfies only analyst", () => {
    expect(hasRole("ADMIN", "ADMIN")).toBe(true);
    expect(hasRole("ADMIN", "ANALYST")).toBe(true);
    expect(hasRole("ANALYST", "ANALYST")).toBe(true);
    expect(hasRole("ANALYST", "ADMIN")).toBe(false);
  });
});

describe("auth schemas", () => {
  it("login normalises the email and requires a password", () => {
    expect(LoginSchema.parse({ email: "  Alice@Example.COM ", password: "x" }).email).toBe("alice@example.com");
    expect(LoginSchema.safeParse({ email: "alice@example.com", password: "" }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(LoginSchema.safeParse({ email: "x'; DROP TABLE app_user;--", password: "x" }).success).toBe(false);
  });
  const valid = { email: "a@example.com", displayName: "A", role: "ANALYST", password: "long-enough-password" };
  it("create-user accepts valid input", () => {
    expect(CreateUserSchema.safeParse(valid).success).toBe(true);
  });
  it.each([
    ["short password", { password: "short" }],
    ["unknown role", { role: "SUPERUSER" }],
    ["blank name", { displayName: "   " }],
    ["mass-assignment of passwordHash", { passwordHash: "x" }],
    ["mass-assignment of isActive", { isActive: true }],
  ])("create-user rejects %s", (_n, patch) => {
    expect(CreateUserSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it("update-user needs at least one known field", () => {
    expect(UpdateUserSchema.safeParse({}).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ unknown: 1 }).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(UpdateUserSchema.safeParse({ role: "ADMIN" }).success).toBe(true);
  });
});

describe("error mapping for auth-related database errors", () => {
  it("maps the last-admin trigger (EV001) to 409 without leaking internals", () => {
    const p = toPublicError(Object.assign(new Error("Cannot delete ... PL/pgSQL function fn_protect_last_admin()"), { code: "EV001" }));
    expect(p).toMatchObject({ status: 409, code: "LAST_ADMIN" });
    expect(JSON.stringify(p)).not.toMatch(/fn_protect|PL\/pgSQL/);
  });
  it("maps unique violations (23505) to 409 without the conflicting value", () => {
    const p = toPublicError(Object.assign(new Error('duplicate key value violates unique constraint "uq_app_user_email" Key (email)=(a@b.c)'), { code: "23505" }));
    expect(p.status).toBe(409);
    expect(JSON.stringify(p)).not.toMatch(/uq_app_user_email|a@b\.c/);
  });
});
