-- ============================================================
-- Migration 004: reusable view of charging sessions with vehicle, charger and station
-- Database: ev_charging_analytics
--
-- ADDITIVE and SAFE TO RE-RUN: one CREATE OR REPLACE VIEW. No table, column, constraint,
-- index or row is touched. Run with:
--   psql -U <user> -d ev_charging_analytics -f database/migrations/004_session_detail_view.sql
--
-- Why a view: the Session Explorer, Demand Analytics and Station pages all need the same
-- four-table join (charging_session -> ev, charger -> charging_station). Defining it once
-- keeps every query consistent and shows view-based reuse.
--
-- Ongoing sessions (end_time IS NULL) are legal in the schema. For them is_ongoing is true
-- and duration_minutes is NULL (never a negative or invented number).
-- ============================================================

CREATE OR REPLACE VIEW v_session_details AS
SELECT
    cs.session_id,
    cs.ev_id,
    ev.registration_no,
    ev.model,
    ev.owner_type,
    st.station_id,
    st.station_name,
    c.charger_id,
    c.charger_type,
    cs.start_time,
    cs.end_time,
    (cs.end_time IS NULL) AS is_ongoing,
    CASE
        WHEN cs.end_time IS NULL THEN NULL
        ELSE ROUND(EXTRACT(EPOCH FROM (cs.end_time - cs.start_time)) / 60.0, 1)
    END AS duration_minutes,
    cs.energy_kwh,
    cs.peak_power_kw,
    cs.cost
FROM charging_session cs
JOIN ev               ON ev.ev_id        = cs.ev_id
JOIN charger c        ON c.charger_id    = cs.charger_id
JOIN charging_station st ON st.station_id = c.station_id;
