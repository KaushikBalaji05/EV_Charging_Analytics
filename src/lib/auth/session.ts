import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type pg from "pg";
import { AUTH } from "@/lib/config";
import { getEnv } from "@/lib/env";
import { query } from "@/lib/db/pool";
import { SESSION_COOKIE, type SessionUser } from "@/lib/auth/constants";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

/** 256-bit random token: this is what the browser holds. */
export const generateToken = () => randomBytes(32).toString("base64url");

/** SHA-256 hex of the token: this is all the database stores. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Inserts a session row using the caller's transaction client. */
export async function createSession(client: pg.PoolClient, userId: number) {
  const token = generateToken();
  const { rows } = await client.query<{ expiresAt: Date }>(
    `INSERT INTO auth_session (token_hash, user_id, expires_at)
     VALUES ($1, $2, now() + make_interval(hours => $3::int))
     RETURNING expires_at AS "expiresAt"`,
    [hashToken(token), userId, AUTH.sessionHours],
  );
  return { token, expiresAt: rows[0].expiresAt };
}

/** Valid = token exists, not expired, and the account is still active. Role is read fresh on every request. */
export async function lookupSession(token: string): Promise<SessionUser | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const rows = await query<SessionUser>(
    `SELECT u.user_id AS "userId", u.email, u.display_name AS "displayName", u.role
       FROM auth_session s
       JOIN app_user u ON u.user_id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

export async function revokeSession(token: string): Promise<void> {
  if (!TOKEN_PATTERN.test(token)) return;
  await query(`DELETE FROM auth_session WHERE token_hash = $1`, [hashToken(token)]);
}

// ---------- cookie helpers ----------

function secureFlag(): boolean {
  return getEnv().COOKIE_SECURE ?? process.env.NODE_ENV === "production";
}

export function buildSessionCookie(token: string): string {
  const parts = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${AUTH.sessionHours * 3600}`];
  if (secureFlag()) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearCookie(): string {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secureFlag()) parts.push("Secure");
  return parts.join("; ");
}

/** Extracts our session token from a raw Cookie header. */
export function readSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) return part.slice(i + 1).trim() || null;
  }
  return null;
}
