import "server-only";
import { query, withTransaction } from "@/lib/db/pool";
import type { Role } from "@/lib/auth/constants";

/** The ONLY columns ever returned to callers. password_hash is deliberately absent. */
const SAFE_COLUMNS = `user_id AS "userId", email, display_name AS "displayName", role,
       is_active AS "isActive", last_login_at AS "lastLoginAt", created_at AS "createdAt"`;

export interface UserRecord {
  userId: number;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export const listUsers = () => query<UserRecord>(`SELECT ${SAFE_COLUMNS} FROM app_user ORDER BY user_id`);

export async function createUser(input: {
  email: string;
  displayName: string;
  role: Role;
  passwordHash: string;
}): Promise<UserRecord> {
  const rows = await query<UserRecord>(
    `INSERT INTO app_user (email, display_name, role, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SAFE_COLUMNS}`,
    [input.email, input.displayName, input.role, input.passwordHash],
  );
  return rows[0];
}

/**
 * Updates only the fields provided. Column names below are fixed literals; every VALUE is a
 * bound parameter. Deactivating a user or resetting a password also revokes all of their
 * sessions, in the same transaction. Returns null if the user does not exist.
 */
export async function updateUser(
  userId: number,
  patch: { displayName?: string; role?: Role; isActive?: boolean },
  passwordHash?: string,
): Promise<UserRecord | null> {
  return withTransaction(async (client) => {
    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (patch.displayName !== undefined) add("display_name", patch.displayName);
    if (patch.role !== undefined) add("role", patch.role);
    if (patch.isActive !== undefined) add("is_active", patch.isActive);
    if (passwordHash !== undefined) {
      add("password_hash", passwordHash);
      sets.push("failed_login_count = 0", "locked_until = NULL");
    }
    values.push(userId);
    const { rows } = await client.query<UserRecord>(
      `UPDATE app_user SET ${sets.join(", ")} WHERE user_id = $${values.length} RETURNING ${SAFE_COLUMNS}`,
      values,
    );
    if (rows.length === 0) return null;
    if (patch.isActive === false || passwordHash !== undefined) {
      await client.query(`DELETE FROM auth_session WHERE user_id = $1`, [userId]);
    }
    return rows[0];
  });
}
