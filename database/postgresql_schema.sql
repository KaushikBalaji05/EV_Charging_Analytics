
-- ============================================================
-- EV Charging Demand & Grid Load Analytics
-- PostgreSQL Database Schema
-- Database: ev_charging_analytics
-- ============================================================

-- 1. Electric Vehicles
CREATE TABLE EV (
    ev_id SERIAL PRIMARY KEY,
    registration_no VARCHAR(20) UNIQUE NOT NULL,
    model VARCHAR(100) NOT NULL,
    battery_capacity_kwh NUMERIC(8,2)
        CHECK (battery_capacity_kwh > 0),
    owner_type VARCHAR(20)
        CHECK (owner_type IN ('PRIVATE', 'COMMERCIAL'))
);

-- 2. Charging Stations
CREATE TABLE Charging_Station (
    station_id SERIAL PRIMARY KEY,
    station_name VARCHAR(100) NOT NULL,
    location VARCHAR(150) NOT NULL,
    total_capacity_kw NUMERIC(10,2)
        CHECK (total_capacity_kw > 0),
    operating_status VARCHAR(20) NOT NULL
        CHECK (
            operating_status IN (
                'ACTIVE', 'INACTIVE', 'MAINTENANCE'
            )
        )
);

-- 3. Chargers
CREATE TABLE Charger (
    charger_id SERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL,
    charger_type VARCHAR(30) NOT NULL,
    rated_power_kw NUMERIC(8,2) NOT NULL
        CHECK (rated_power_kw > 0),
    status VARCHAR(20) NOT NULL
        CHECK (
            status IN (
                'AVAILABLE', 'IN_USE', 'FAULTY', 'INACTIVE'
            )
        ),
    CONSTRAINT fk_charger_station
        FOREIGN KEY (station_id)
        REFERENCES Charging_Station(station_id)
);

-- 4. Charging Sessions
CREATE TABLE Charging_Session (
    session_id SERIAL PRIMARY KEY,
    ev_id INTEGER NOT NULL,
    charger_id INTEGER NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    energy_kwh NUMERIC(10,2) NOT NULL DEFAULT 0
        CHECK (energy_kwh >= 0),
    peak_power_kw NUMERIC(10,2)
        CHECK (peak_power_kw >= 0),
    cost NUMERIC(10,2) NOT NULL DEFAULT 0
        CHECK (cost >= 0),

    CONSTRAINT fk_session_ev
        FOREIGN KEY (ev_id)
        REFERENCES EV(ev_id),

    CONSTRAINT fk_session_charger
        FOREIGN KEY (charger_id)
        REFERENCES Charger(charger_id),

    CONSTRAINT chk_session_time
        CHECK (
            end_time IS NULL OR end_time >= start_time
        )
);

-- 5. Grid Telemetry
CREATE TABLE Grid_Telemetry (
    telemetry_id BIGSERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL,
    recorded_at TIMESTAMP NOT NULL,
    voltage_v NUMERIC(10,2)
        CHECK (voltage_v >= 0),
    current_a NUMERIC(10,2)
        CHECK (current_a >= 0),
    power_kw NUMERIC(10,2)
        CHECK (power_kw >= 0),
    frequency_hz NUMERIC(6,3)
        CHECK (frequency_hz >= 0),
    grid_load_kw NUMERIC(10,2)
        CHECK (grid_load_kw >= 0),

    CONSTRAINT fk_telemetry_station
        FOREIGN KEY (station_id)
        REFERENCES Charging_Station(station_id)
);

-- 6. Station Capacity Snapshots
CREATE TABLE Station_Capacity (
    capacity_id BIGSERIAL PRIMARY KEY,
    station_id INTEGER NOT NULL,
    recorded_at TIMESTAMP NOT NULL,
    max_load_kw NUMERIC(10,2) NOT NULL
        CHECK (max_load_kw > 0),
    current_load_kw NUMERIC(10,2) NOT NULL
        CHECK (current_load_kw >= 0),
    utilization_pct NUMERIC(7,2),
    overload_status VARCHAR(20) NOT NULL
        CHECK (
            overload_status IN ('NORMAL', 'OVERLOADED')
        ),

    CONSTRAINT fk_capacity_station
        FOREIGN KEY (station_id)
        REFERENCES Charging_Station(station_id),

    -- Utilization above 100% is valid for overloaded stations.
    CONSTRAINT chk_utilization
        CHECK (
            utilization_pct IS NULL OR utilization_pct >= 0
        )
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_session_start_time
    ON Charging_Session(start_time);

CREATE INDEX idx_session_charger
    ON Charging_Session(charger_id);

CREATE INDEX idx_session_ev
    ON Charging_Session(ev_id);

CREATE INDEX idx_telemetry_station_time
    ON Grid_Telemetry(station_id, recorded_at);

CREATE INDEX idx_capacity_station_time
    ON Station_Capacity(station_id, recorded_at);

-- End of schema
