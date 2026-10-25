-- ============================================================
-- Migration 003: authentication tables (users, login sessions) + last-admin guard
-- Database: ev_charging_analytics
--
-- ADDITIVE and SAFE TO RE-RUN. Creates only new objects; it does not touch the six
-- original tables, their data, or migration 002. Run with:
--   psql -U <user> -d ev_charging_analytics -f database/migrations/003_users_and_sessions.sql
--
-- Naming: "auth_session" is a LOGIN session. It is unrelated to "charging_session".
-- Auth tables use TIMESTAMPTZ because expiry/lockout compare against now() and must be
-- unambiguous; the original analytics tables keep their TIMESTAMP columns unchanged.
--
-- Advanced DBMS concepts here:
--   Constraints (CHECK, UNIQUE, FK ON DELETE CASCADE), indexes,
--   a trigger + stored function that protects the last active administrator.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS app_user (
    user_id            SERIAL PRIMARY KEY,
    email              VARCHAR(254) NOT NULL,
    display_name       VARCHAR(100) NOT NULL,
    password_hash      TEXT         NOT NULL,           -- Argon2id PHC string; never plaintext
    role               VARCHAR(10)  NOT NULL,
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE,
    failed_login_count INTEGER      NOT NULL DEFAULT 0,
    locked_until       TIMESTAMPTZ,
    last_login_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_app_user_role       CHECK (role IN ('ADMIN', 'ANALYST')),
    CONSTRAINT chk_app_user_email      CHECK (email = lower(email) AND position('@' IN email) > 1),
    CONSTRAINT chk_app_user_name       CHECK (length(btrim(display_name)) > 0),
    CONSTRAINT chk_app_user_failed     CHECK (failed_login_count >= 0)
);

-- One account per email address (emails are stored lower-case, enforced above).
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_user_email ON app_user (email);

-- Login sessions. Only the SHA-256 hash of the cookie token is stored, so a leaked
-- table cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS auth_session (
    token_hash CHAR(64)    PRIMARY KEY,
    user_id    INTEGER     NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT chk_auth_session_hash   CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_auth_session_expiry CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_auth_session_user    ON auth_session (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_session_expires ON auth_session (expires_at);

-- ---------- Last-administrator guard (trigger + stored function) ----------
-- Refuses to delete, demote or deactivate the last ACTIVE admin, so the system can
-- never be locked out of administration. SQLSTATE 'EV001' is a project-specific code
-- that the application maps to HTTP 409.
-- Other active admins are locked (FOR UPDATE) so that two concurrent changes cannot
-- each see "someone else is still admin" and both succeed.
CREATE OR REPLACE FUNCTION fn_protect_last_admin()
RETURNS trigger AS $$
BEGIN
    IF OLD.role = 'ADMIN' AND OLD.is_active
       AND (TG_OP = 'DELETE' OR NEW.role <> 'ADMIN' OR NOT NEW.is_active) THEN
        PERFORM 1
           FROM app_user
          WHERE role = 'ADMIN' AND is_active AND user_id <> OLD.user_id
          FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Cannot delete, demote or deactivate the last active administrator'
                USING ERRCODE = 'EV001';
        END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_last_admin ON app_user;
CREATE TRIGGER trg_protect_last_admin
    BEFORE UPDATE OF role, is_active OR DELETE
    ON app_user
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_last_admin();

COMMIT;
