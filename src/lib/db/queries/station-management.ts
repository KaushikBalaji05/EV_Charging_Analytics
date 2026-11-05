import "server-only";
import { query, withTransaction } from "@/lib/db/pool";
import { ApiError } from "@/lib/api/errors";
import type { StationDependencies, ChargerDependencies } from "@/lib/types/data-admin";

// ============================================================================
// AUDIT LOGGING HELPER
// ============================================================================

export async function logAdminActivity(
  userId: number,
  action: "DEACTIVATE" | "REACTIVATE" | "DELETE",
  entityType: "charging_station" | "charger",
  entityId: number,
  entityName?: string | null,
  details?: Record<string, unknown>
): Promise<void> {
  const detailsStr = details ? JSON.stringify(details) : "";
  console.info(
    `[admin-audit] Admin #${userId} performed ${action} on ${entityType} #${entityId} ('${entityName || "unnamed"}') ${detailsStr}`
  );

  try {
    await query(
      `INSERT INTO admin_activity_log (user_id, action, entity_type, entity_id, entity_name, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entityType, entityId, entityName ?? null, details ? JSON.stringify(details) : null]
    );
  } catch {
    // If the audit table does not exist or fails, do not block the operational flow.
    // The structured stdout console log serves as reliable process-level audit.
  }
}

// ============================================================================
// CHARGING STATION MANAGEMENT
// ============================================================================

export async function getStationDependencies(stationId: number): Promise<StationDependencies> {
  const stationRows = await query<{
    station_id: number;
    station_name: string;
    location: string;
    total_capacity_kw: number;
    operating_status: string;
  }>(
    `SELECT station_id, station_name, location, total_capacity_kw, operating_status
       FROM charging_station
      WHERE station_id = $1`,
    [stationId]
  );

  if (stationRows.length === 0) {
    throw new ApiError(404, "STATION_NOT_FOUND", `Charging Station #${stationId} does not exist.`);
  }

  const station = stationRows[0];

  const [depRow] = await query<{
    chargers: number;
    sessions: number;
    capacitySnapshots: number;
    telemetryReadings: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM charger WHERE station_id = $1) AS chargers,
       (SELECT COUNT(*)::int FROM charging_session cs JOIN charger c ON c.charger_id = cs.charger_id WHERE c.station_id = $1) AS sessions,
       (SELECT COUNT(*)::int FROM station_capacity WHERE station_id = $1) AS "capacitySnapshots",
       (SELECT COUNT(*)::int FROM grid_telemetry WHERE station_id = $1) AS "telemetryReadings"`,
    [stationId]
  );

  const chargers = depRow?.chargers ?? 0;
  const sessions = depRow?.sessions ?? 0;
  const capacitySnapshots = depRow?.capacitySnapshots ?? 0;
  const telemetryReadings = depRow?.telemetryReadings ?? 0;
  const totalDependencies = chargers + sessions + capacitySnapshots + telemetryReadings;
  const canDelete = totalDependencies === 0;

  return {
    stationId: station.station_id,
    stationName: station.station_name,
    location: station.location,
    totalCapacityKw: station.total_capacity_kw,
    operatingStatus: station.operating_status,
    dependencies: {
      chargers,
      sessions,
      capacitySnapshots,
      telemetryReadings,
      totalDependencies,
    },
    canDelete,
    recommendation: canDelete ? "delete" : "deactivate",
  };
}

export async function deactivateStation(
  stationId: number,
  adminUserId: number
): Promise<{ stationId: number; stationName: string; operatingStatus: string }> {
  return withTransaction(async (client) => {
    const check = await client.query<{ station_id: number; station_name: string; operating_status: string }>(
      `SELECT station_id, station_name, operating_status FROM charging_station WHERE station_id = $1 FOR UPDATE`,
      [stationId]
    );

    if (check.rows.length === 0) {
      throw new ApiError(404, "STATION_NOT_FOUND", `Charging Station #${stationId} does not exist.`);
    }

    const current = check.rows[0];

    const res = await client.query<{ station_id: number; station_name: string; operating_status: string }>(
      `UPDATE charging_station
          SET operating_status = 'INACTIVE'
        WHERE station_id = $1
        RETURNING station_id, station_name, operating_status`,
      [stationId]
    );

    const updated = res.rows[0];

    await logAdminActivity(adminUserId, "DEACTIVATE", "charging_station", stationId, updated.station_name, {
      previousStatus: current.operating_status,
      newStatus: "INACTIVE",
    });

    return {
      stationId: updated.station_id,
      stationName: updated.station_name,
      operatingStatus: updated.operating_status,
    };
  });
}

export async function reactivateStation(
  stationId: number,
  adminUserId: number
): Promise<{ stationId: number; stationName: string; operatingStatus: string }> {
  return withTransaction(async (client) => {
    const check = await client.query<{ station_id: number; station_name: string; operating_status: string }>(
      `SELECT station_id, station_name, operating_status FROM charging_station WHERE station_id = $1 FOR UPDATE`,
      [stationId]
    );

    if (check.rows.length === 0) {
      throw new ApiError(404, "STATION_NOT_FOUND", `Charging Station #${stationId} does not exist.`);
    }

    const current = check.rows[0];

    const res = await client.query<{ station_id: number; station_name: string; operating_status: string }>(
      `UPDATE charging_station
          SET operating_status = 'ACTIVE'
        WHERE station_id = $1
        RETURNING station_id, station_name, operating_status`,
      [stationId]
    );

    const updated = res.rows[0];

    await logAdminActivity(adminUserId, "REACTIVATE", "charging_station", stationId, updated.station_name, {
      previousStatus: current.operating_status,
      newStatus: "ACTIVE",
    });

    return {
      stationId: updated.station_id,
      stationName: updated.station_name,
      operatingStatus: updated.operating_status,
    };
  });
}

export async function deleteStation(
  stationId: number,
  adminUserId: number
): Promise<{ stationId: number; stationName: string; deleted: boolean }> {
  return withTransaction(async (client) => {
    const check = await client.query<{ station_id: number; station_name: string }>(
      `SELECT station_id, station_name FROM charging_station WHERE station_id = $1 FOR UPDATE`,
      [stationId]
    );

    if (check.rows.length === 0) {
      throw new ApiError(404, "STATION_NOT_FOUND", `Charging Station #${stationId} does not exist.`);
    }

    const stationName = check.rows[0].station_name;

    // Check all dependencies with lock held
    const depRes = await client.query<{
      chargers: number;
      sessions: number;
      capacitySnapshots: number;
      telemetryReadings: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM charger WHERE station_id = $1) AS chargers,
         (SELECT COUNT(*)::int FROM charging_session cs JOIN charger c ON c.charger_id = cs.charger_id WHERE c.station_id = $1) AS sessions,
         (SELECT COUNT(*)::int FROM station_capacity WHERE station_id = $1) AS "capacitySnapshots",
         (SELECT COUNT(*)::int FROM grid_telemetry WHERE station_id = $1) AS "telemetryReadings"`,
      [stationId]
    );

    const deps = depRes.rows[0];
    const totalDependencies =
      (deps.chargers || 0) +
      (deps.sessions || 0) +
      (deps.capacitySnapshots || 0) +
      (deps.telemetryReadings || 0);

    if (totalDependencies > 0) {
      const summaryParts = [];
      if (deps.chargers > 0) summaryParts.push(`${deps.chargers} charger(s)`);
      if (deps.sessions > 0) summaryParts.push(`${deps.sessions} charging session(s)`);
      if (deps.capacitySnapshots > 0) summaryParts.push(`${deps.capacitySnapshots} capacity record(s)`);
      if (deps.telemetryReadings > 0) summaryParts.push(`${deps.telemetryReadings} telemetry reading(s)`);

      throw new ApiError(
        409,
        "STATION_HAS_DEPENDENCIES",
        `Cannot permanently delete Station #${stationId} ('${stationName}') because it has dependent records (${summaryParts.join(", ")}). Please deactivate the station instead to preserve historical analytics and maintain referential integrity.`
      );
    }

    // Safe deletion: no dependent records exist
    await client.query(`DELETE FROM charging_station WHERE station_id = $1`, [stationId]);

    await logAdminActivity(adminUserId, "DELETE", "charging_station", stationId, stationName, {
      permanent: true,
    });

    return {
      stationId,
      stationName,
      deleted: true,
    };
  });
}

// ============================================================================
// CHARGER MANAGEMENT
// ============================================================================

export async function getChargerDependencies(chargerId: number): Promise<ChargerDependencies> {
  const chargerRows = await query<{
    charger_id: number;
    station_id: number;
    station_name: string;
    charger_type: string;
    rated_power_kw: number;
    status: string;
  }>(
    `SELECT c.charger_id, c.station_id, cs.station_name, c.charger_type, c.rated_power_kw, c.status
       FROM charger c
       JOIN charging_station cs ON cs.station_id = c.station_id
      WHERE c.charger_id = $1`,
    [chargerId]
  );

  if (chargerRows.length === 0) {
    throw new ApiError(404, "CHARGER_NOT_FOUND", `Charger #${chargerId} does not exist.`);
  }

  const charger = chargerRows[0];

  const [depRow] = await query<{ sessions: number }>(
    `SELECT COUNT(*)::int AS sessions FROM charging_session WHERE charger_id = $1`,
    [chargerId]
  );

  const sessions = depRow?.sessions ?? 0;
  const canDelete = sessions === 0;

  return {
    chargerId: charger.charger_id,
    stationId: charger.station_id,
    stationName: charger.station_name,
    chargerType: charger.charger_type,
    ratedPowerKw: charger.rated_power_kw,
    status: charger.status,
    dependencies: {
      sessions,
      totalDependencies: sessions,
    },
    canDelete,
    recommendation: canDelete ? "delete" : "deactivate",
  };
}

export async function deactivateCharger(
  chargerId: number,
  adminUserId: number
): Promise<{ chargerId: number; stationId: number; status: string }> {
  return withTransaction(async (client) => {
    const check = await client.query<{ charger_id: number; station_id: number; charger_type: string; status: string }>(
      `SELECT charger_id, station_id, charger_type, status FROM charger WHERE charger_id = $1 FOR UPDATE`,
      [chargerId]
    );

    if (check.rows.length === 0) {
      throw new ApiError(404, "CHARGER_NOT_FOUND", `Charger #${chargerId} does not exist.`);
    }

    const current = check.rows[0];

    const res = await client.query<{ charger_id: number; station_id: number; status: string }>(
      `UPDATE charger
          SET status = 'INACTIVE'
        WHERE charger_id = $1
        RETURNING charger_id, station_id, status`,
      [chargerId]
    );

    const updated = res.rows[0];

    await logAdminActivity(adminUserId, "DEACTIVATE", "charger", chargerId, current.charger_type, {
      previousStatus: current.status,
      newStatus: "INACTIVE",
      stationId: updated.station_id,
    });

    return {
      chargerId: updated.charger_id,
      stationId: updated.station_id,
      status: updated.status,
    };
  });
}

export async function reactivateCharger(
  chargerId: number,
  adminUserId: number
): Promise<{ chargerId: number; stationId: number; status: string }> {
  return withTransaction(async (client) => {
    const check = await client.query<{ charger_id: number; station_id: number; charger_type: string; status: string }>(
      `SELECT charger_id, station_id, charger_type, status FROM charger WHERE charger_id = $1 FOR UPDATE`,
      [chargerId]
    );

    if (check.rows.length === 0) {
      throw new ApiError(404, "CHARGER_NOT_FOUND", `Charger #${chargerId} does not exist.`);
    }

    const current = check.rows[0];

    const res = await client.query<{ charger_id: number; station_id: number; status: string }>(
      `UPDATE charger
          SET status = 'AVAILABLE'
        WHERE charger_id = $1
        RETURNING charger_id, station_id, status`,
      [chargerId]
    );

    const updated = res.rows[0];

    await logAdminActivity(adminUserId, "REACTIVATE", "charger", chargerId, current.charger_type, {
      previousStatus: current.status,
      newStatus: "AVAILABLE",
      stationId: updated.station_id,
    });

    return {
      chargerId: updated.charger_id,
      stationId: updated.station_id,
      status: updated.status,
    };
  });
}

export async function deleteCharger(
  chargerId: number,
  adminUserId: number
): Promise<{ chargerId: number; stationId: number; deleted: boolean }> {
  return withTransaction(async (client) => {
    const check = await client.query<{ charger_id: number; station_id: number; charger_type: string }>(
      `SELECT charger_id, station_id, charger_type FROM charger WHERE charger_id = $1 FOR UPDATE`,
      [chargerId]
    );

    if (check.rows.length === 0) {
      throw new ApiError(404, "CHARGER_NOT_FOUND", `Charger #${chargerId} does not exist.`);
    }

    const current = check.rows[0];

    // Check sessions dependency
    const depRes = await client.query<{ sessions: number }>(
      `SELECT COUNT(*)::int AS sessions FROM charging_session WHERE charger_id = $1`,
      [chargerId]
    );

    const sessions = depRes.rows[0]?.sessions ?? 0;

    if (sessions > 0) {
      throw new ApiError(
        409,
        "CHARGER_HAS_DEPENDENCIES",
        `Cannot permanently delete Charger #${chargerId} because it has ${sessions} dependent historical charging session(s). Please deactivate the charger instead to preserve historical records.`
      );
    }

    // Safe deletion: no sessions exist
    await client.query(`DELETE FROM charger WHERE charger_id = $1`, [chargerId]);

    await logAdminActivity(adminUserId, "DELETE", "charger", chargerId, current.charger_type, {
      permanent: true,
      stationId: current.station_id,
    });

    return {
      chargerId,
      stationId: current.station_id,
      deleted: true,
    };
  });
}
