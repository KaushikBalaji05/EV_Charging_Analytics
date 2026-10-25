import "server-only";
import { AUTH } from "@/lib/config";
import { withTransaction } from "@/lib/db/pool";
import { verifyAgainstDummy, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import type { Role, SessionUser } from "@/lib/auth/constants";

interface AccountRow {
  userId: number;
  email: string;
  displayName: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
  locked: boolean;
}

export interface LoginSuccess {
  user: SessionUser;
  token: string;
}

/**
 * Verifies credentials and, on success, starts a session. Returns null for EVERY failure
 * (unknown email, wrong password, disabled account, locked account) so callers cannot
 * reveal which one it was.
 *
 * One transaction. The account row is locked (SELECT ... FOR UPDATE), so simultaneous
 * guesses against the same account are processed one at a time and cannot dodge the
 * failure counter. Failed-attempt bookkeeping is committed even though login fails.
 */
export async function authenticate(email: string, password: string): Promise<LoginSuccess | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<AccountRow>(
      `SELECT user_id AS "userId", email, display_name AS "displayName", role,
              password_hash AS "passwordHash", is_active AS "isActive",
              (locked_until IS NOT NULL AND locked_until > now()) AS locked
         FROM app_user
        WHERE email = $1
          FOR UPDATE`,
      [email],
    );
    const account = rows[0];

    if (!account) {
      await verifyAgainstDummy(password);
      return null;
    }

    // Always run the (slow) hash check, even for locked/disabled accounts, to keep timing uniform.
    const passwordOk = await verifyPassword(account.passwordHash, password);
    if (account.locked || !account.isActive) return null;

    if (!passwordOk) {
      await client.query(
        `UPDATE app_user
            SET failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
                locked_until       = CASE WHEN failed_login_count + 1 >= $2
                                          THEN now() + make_interval(mins => $3::int) ELSE locked_until END
          WHERE user_id = $1`,
        [account.userId, AUTH.maxFailedLogins, AUTH.lockMinutes],
      );
      return null;
    }

    await client.query(
      `UPDATE app_user SET failed_login_count = 0, locked_until = NULL, last_login_at = now() WHERE user_id = $1`,
      [account.userId],
    );
    await client.query(`DELETE FROM auth_session WHERE user_id = $1 AND expires_at <= now()`, [account.userId]);
    const { token } = await createSession(client, account.userId);

    return {
      user: { userId: account.userId, email: account.email, displayName: account.displayName, role: account.role },
      token,
    };
  });
}
