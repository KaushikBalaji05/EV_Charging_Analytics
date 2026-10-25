// No "server-only" here: shared by the proxy, server code and client components.
export const SESSION_COOKIE = "ev_session";

export type Role = "ADMIN" | "ANALYST";
export const ROLES: readonly Role[] = ["ADMIN", "ANALYST"];

const RANK: Record<Role, number> = { ANALYST: 1, ADMIN: 2 };

/** ADMIN satisfies any requirement; ANALYST satisfies only ANALYST. */
export const hasRole = (actual: Role, required: Role) => RANK[actual] >= RANK[required];

export interface SessionUser {
  userId: number;
  email: string;
  displayName: string;
  role: Role;
}
