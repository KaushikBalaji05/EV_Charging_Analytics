-- ============================================================
-- Migration 006: Admin activity audit log for station and charger management
-- Database: ev_charging_analytics
--
-- SAFE TO RE-RUN: creates admin_activity_log table and indexes if not exists.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS admin_activity_log (
    log_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES app_user(user_id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- 'DEACTIVATE', 'REACTIVATE', 'DELETE'
    entity_type VARCHAR(50) NOT NULL, -- 'charging_station', 'charger'
    entity_id INTEGER NOT NULL,
    entity_name VARCHAR(150),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_entity
    ON admin_activity_log (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_admin_activity_created
    ON admin_activity_log (created_at DESC);

COMMIT;
