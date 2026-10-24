
-- ============================================================
-- EV Charging Demand & Grid Load Analytics
-- PostgreSQL Sample Data
-- NOTE: These are synthetic records for testing.
-- ============================================================

-- 1. Electric Vehicles
INSERT INTO EV
    (registration_no, model, battery_capacity_kwh, owner_type)
VALUES
    ('KA01EV1001', 'Tata Nexon EV', 40.50, 'PRIVATE'),
    ('KA01EV1002', 'MG ZS EV', 50.30, 'PRIVATE'),
    ('KA01EV1003', 'Tata Tiago EV', 24.00, 'COMMERCIAL');

-- 2. Charging Stations
INSERT INTO Charging_Station
    (station_name, location, total_capacity_kw, operating_status)
VALUES
    ('Central Charging Hub', 'Bengaluru Central', 100, 'ACTIVE'),
    ('Tech Park Charging Hub', 'Whitefield', 150, 'ACTIVE');

-- 3. Chargers
INSERT INTO Charger
    (station_id, charger_type, rated_power_kw, status)
VALUES
    (1, 'DC_FAST', 50, 'AVAILABLE'),
    (1, 'AC_NORMAL', 22, 'AVAILABLE'),
    (2, 'DC_FAST', 100, 'AVAILABLE');

-- 4. Charging Sessions
INSERT INTO Charging_Session
    (ev_id, charger_id, start_time, end_time,
     energy_kwh, peak_power_kw, cost)
VALUES
    (1, 1, '2026-10-20 09:00:00',
     '2026-10-20 10:00:00', 35, 48, 420),

    (2, 2, '2026-10-20 10:00:00',
     '2026-10-20 12:00:00', 18, 20, 216),

    (3, 3, '2026-10-20 11:00:00',
     '2026-10-20 11:45:00', 22, 95, 264);

-- 5. Grid Telemetry
INSERT INTO Grid_Telemetry
    (station_id, recorded_at, voltage_v, current_a,
     power_kw, frequency_hz, grid_load_kw)
VALUES
    (1, '2026-10-20 09:00:00',
     230, 180, 41.40, 50.000, 85),

    (1, '2026-10-20 10:00:00',
     228, 200, 45.60, 49.950, 105),

    (2, '2026-10-20 11:00:00',
     415, 150, 95.00, 50.020, 120);

-- 6. Station Capacity Snapshots
INSERT INTO Station_Capacity
    (station_id, recorded_at, max_load_kw,
     current_load_kw, utilization_pct, overload_status)
VALUES
    (1, '2026-10-20 09:00:00',
     100, 85, 85, 'NORMAL'),

    (1, '2026-10-20 10:00:00',
     100, 105, 105, 'OVERLOADED'),

    (2, '2026-10-20 11:00:00',
     150, 120, 80, 'NORMAL');

-- End of sample data
