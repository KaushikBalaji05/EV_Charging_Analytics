-- ============================================================
-- Migration 005: Station capacity trigger guard against division by zero
-- Database: ev_charging_analytics
--
-- SAFE TO RE-RUN: updates the stored procedure fn_station_capacity_compute()
-- to guard against non-positive max_load_kw before division occurs.
-- Preserves all existing utilization and overload formulas.
--
-- Run with:
--   psql -U <user> -d ev_charging_analytics -f database/migrations/005_fix_station_capacity_guard.sql
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_station_capacity_compute()
RETURNS trigger AS $$
BEGIN
    IF NEW.max_load_kw IS NULL OR NEW.max_load_kw <= 0 THEN
        RAISE EXCEPTION 'Station capacity max_load_kw must be strictly positive (got %)', NEW.max_load_kw
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.utilization_pct := ROUND(NEW.current_load_kw / NEW.max_load_kw * 100, 2);
    NEW.overload_status := CASE
        WHEN NEW.current_load_kw > NEW.max_load_kw THEN 'OVERLOADED'
        ELSE 'NORMAL'
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
