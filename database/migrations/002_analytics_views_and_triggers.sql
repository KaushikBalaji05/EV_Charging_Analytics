-- ============================================================
-- Migration 002: analytical views, capacity trigger, extra indexes
-- Database: ev_charging_analytics
--
-- SAFE TO RE-RUN: only creates or replaces objects this project owns.
-- It does NOT drop, alter or delete any existing table, column,
-- constraint, index or row. Run with:
--   psql -U <user> -d ev_charging_analytics -f database/migrations/002_analytics_views_and_triggers.sql
--
-- Advanced DBMS concepts demonstrated here:
--   (a) Views      -> v_overload_events, v_station_latest_capacity
--   (b) Trigger    -> trg_station_capacity_compute (+ stored function)
--   (c) Indexes    -> partial index + two supporting indexes
-- ============================================================

BEGIN;

-- ---------- (a) VIEWS ----------

-- One row per capacity snapshot where the station was OVERLOADED.
-- A "capacity snapshot" (Station_Capacity) is a measured load vs permitted load.
-- It is deliberately separate from a Grid_Telemetry reading (voltage/current/frequency).
CREATE OR REPLACE VIEW v_overload_events AS
SELECT
    sc.capacity_id,
    sc.station_id,
    cs.station_name,
    cs.location,
    sc.recorded_at,
    sc.current_load_kw,
    sc.max_load_kw,
    COALESCE(
        sc.utilization_pct,
        ROUND(sc.current_load_kw / sc.max_load_kw * 100, 2)
    )                                              AS utilization_pct,
    ROUND(sc.current_load_kw - sc.max_load_kw, 2)  AS overload_kw
FROM station_capacity sc
JOIN charging_station cs ON cs.station_id = sc.station_id
WHERE sc.overload_status = 'OVERLOADED';

-- Most recent capacity snapshot per station (DISTINCT ON keeps the newest row).
CREATE OR REPLACE VIEW v_station_latest_capacity AS
SELECT DISTINCT ON (sc.station_id)
    sc.station_id,
    sc.recorded_at,
    sc.current_load_kw,
    sc.max_load_kw,
    COALESCE(
        sc.utilization_pct,
        ROUND(sc.current_load_kw / sc.max_load_kw * 100, 2)
    )                  AS utilization_pct,
    sc.overload_status
FROM station_capacity sc
ORDER BY sc.station_id, sc.recorded_at DESC, sc.capacity_id DESC;

-- ---------- (b) TRIGGER + STORED FUNCTION ----------

-- Keeps utilization_pct and overload_status consistent with the loads, so the
-- stored values can never contradict current_load_kw / max_load_kw.
-- Rule: OVERLOADED only when current load is strictly greater than max load.
-- utilization_pct is NOT capped at 100 (values above 100 represent overload).
CREATE OR REPLACE FUNCTION fn_station_capacity_compute()
RETURNS trigger AS $$
BEGIN
    NEW.utilization_pct := ROUND(NEW.current_load_kw / NEW.max_load_kw * 100, 2);
    NEW.overload_status := CASE
        WHEN NEW.current_load_kw > NEW.max_load_kw THEN 'OVERLOADED'
        ELSE 'NORMAL'
    END;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_station_capacity_compute ON station_capacity;
CREATE TRIGGER trg_station_capacity_compute
    BEFORE INSERT OR UPDATE OF max_load_kw, current_load_kw
    ON station_capacity
    FOR EACH ROW
    EXECUTE FUNCTION fn_station_capacity_compute();

-- ---------- (c) INDEXES ----------

-- Overload queries touch only a small fraction of rows; a partial index stays tiny
-- and serves "latest overload events" ordered by time.
CREATE INDEX IF NOT EXISTS idx_capacity_overloaded_time
    ON station_capacity (recorded_at DESC)
    WHERE overload_status = 'OVERLOADED';

-- "Latest telemetry across all stations" orders by time only; the existing
-- (station_id, recorded_at) index cannot serve that efficiently.
CREATE INDEX IF NOT EXISTS idx_telemetry_recorded_at
    ON grid_telemetry (recorded_at DESC);

-- Foreign-key column used when joining sessions -> chargers -> stations.
CREATE INDEX IF NOT EXISTS idx_charger_station
    ON charger (station_id);

COMMIT;
