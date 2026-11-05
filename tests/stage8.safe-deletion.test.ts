/**
 * Stage 8 — Safe Charging Station & Charger Deletion and Deactivation Tests
 *
 * Covers:
 * 1. Unit Tests: Zod validation schemas, transforms, parameter guards.
 * 2. Integration Tests: Real route handlers, RBAC, dependency evaluation,
 *    deactivation, reactivation, deletion blocking, safe deletion, and audit logging.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query } from "@/lib/db/pool";
import {
  UpdateStationStatusSchema,
  UpdateChargerStatusSchema,
  EntityIdParamSchema,
} from "@/lib/validation/data-admin";
import {
  GET as stationGET,
  PATCH as stationPATCH,
  DELETE as stationDELETE,
} from "@/app/api/admin/data/stations/[id]/route";
import {
  GET as chargerGET,
  PATCH as chargerPATCH,
  DELETE as chargerDELETE,
} from "@/app/api/admin/data/chargers/[id]/route";
import { POST as sessionsPOST } from "@/app/api/admin/data/sessions/route";
import {
  cleanupTestUsers,
  makeTestUser,
  sessionTokenFor,
} from "./helpers/users";

const hasDb = Boolean(process.env.DATABASE_URL);
const body = async (res: Response) => JSON.parse(await res.text());

// ============================================================================
// 1. UNIT TESTS: VALIDATION SCHEMAS & TRANSFORMS (NO DB REQUIRED)
// ============================================================================
describe("Stage 8 — Unit Tests: Schemas & Parameter Validation", () => {
  describe("EntityIdParamSchema", () => {
    it("accepts valid positive integer strings", () => {
      expect(EntityIdParamSchema.parse("1")).toBe(1);
      expect(EntityIdParamSchema.parse("42")).toBe(42);
      expect(EntityIdParamSchema.parse(100)).toBe(100);
    });

    it("rejects non-positive integers, floats, and strings", () => {
      expect(() => EntityIdParamSchema.parse("0")).toThrow();
      expect(() => EntityIdParamSchema.parse("-5")).toThrow();
      expect(() => EntityIdParamSchema.parse("abc")).toThrow();
      expect(() => EntityIdParamSchema.parse("1.5")).toThrow();
    });
  });

  describe("UpdateStationStatusSchema", () => {
    it("transforms action 'deactivate' to status 'INACTIVE'", () => {
      const result = UpdateStationStatusSchema.parse({ action: "deactivate" });
      expect(result).toEqual({ status: "INACTIVE", action: "deactivate" });
    });

    it("transforms action 'reactivate' to status 'ACTIVE'", () => {
      const result = UpdateStationStatusSchema.parse({ action: "reactivate" });
      expect(result).toEqual({ status: "ACTIVE", action: "reactivate" });
    });

    it("accepts direct status 'ACTIVE' and 'INACTIVE'", () => {
      expect(UpdateStationStatusSchema.parse({ status: "ACTIVE" })).toEqual({
        status: "ACTIVE",
        action: "reactivate",
      });
      expect(UpdateStationStatusSchema.parse({ status: "INACTIVE" })).toEqual({
        status: "INACTIVE",
        action: "deactivate",
      });
    });

    it("rejects empty payload or invalid status values", () => {
      expect(() => UpdateStationStatusSchema.parse({})).toThrow();
      expect(() => UpdateStationStatusSchema.parse({ status: "INVALID_STATUS" })).toThrow();
      expect(() => UpdateStationStatusSchema.parse({ action: "invalid_action" })).toThrow();
    });
  });

  describe("UpdateChargerStatusSchema", () => {
    it("transforms action 'deactivate' to status 'INACTIVE'", () => {
      const result = UpdateChargerStatusSchema.parse({ action: "deactivate" });
      expect(result).toEqual({ status: "INACTIVE", action: "deactivate" });
    });

    it("transforms action 'reactivate' to status 'AVAILABLE'", () => {
      const result = UpdateChargerStatusSchema.parse({ action: "reactivate" });
      expect(result).toEqual({ status: "AVAILABLE", action: "reactivate" });
    });

    it("accepts direct charger statuses", () => {
      expect(UpdateChargerStatusSchema.parse({ status: "AVAILABLE" })).toEqual({
        status: "AVAILABLE",
        action: "reactivate",
      });
      expect(UpdateChargerStatusSchema.parse({ status: "INACTIVE" })).toEqual({
        status: "INACTIVE",
        action: "deactivate",
      });
    });

    it("rejects empty payload or unknown charger statuses", () => {
      expect(() => UpdateChargerStatusSchema.parse({})).toThrow();
      expect(() => UpdateChargerStatusSchema.parse({ status: "BROKEN" })).toThrow();
    });
  });
});

// ============================================================================
// 2. INTEGRATION TESTS (REAL ROUTE HANDLERS & DATABASE)
// ============================================================================
describe.skipIf(!hasDb)("Stage 8 — Safe Station & Charger Deletion/Deactivation Integration", () => {
  let adminToken = "";
  let analystToken = "";

  // Clean-up tracker for temporary test fixtures
  const createdStationIds: number[] = [];
  const createdChargerIds: number[] = [];

  beforeAll(async () => {
    try {
      await cleanupTestUsers();
      const adminUser = await makeTestUser("ADMIN");
      adminToken = await sessionTokenFor(adminUser);
      analystToken = await sessionTokenFor(await makeTestUser("ANALYST"));
    } catch {
      // In sandbox mode without network access, tests in this block will fail gracefully
    }
  });

  afterAll(async () => {
    try {
      for (const chId of createdChargerIds) {
        await query(`DELETE FROM charger WHERE charger_id = $1`, [chId]).catch(() => {});
      }
      for (const stId of createdStationIds) {
        await query(`DELETE FROM charging_station WHERE station_id = $1`, [stId]).catch(() => {});
      }
      await cleanupTestUsers();
      await getPool().end();
    } catch {
      // ignore teardown errors
    }
  });

  // --------------------------------------------------------------------------
  // A. Security & Role-Based Access Control
  // --------------------------------------------------------------------------
  describe("Security & Role-Based Access Control", () => {
    it("rejects unauthenticated requests with 401 for station management", async () => {
      const ctx = { params: Promise.resolve({ id: "1" }) };
      const getRes = await stationGET(new Request("http://localhost:3000/api/admin/data/stations/1"), ctx);
      expect(getRes.status).toBe(401);

      const patchRes = await stationPATCH(
        new Request("http://localhost:3000/api/admin/data/stations/1", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "deactivate" }),
        }),
        ctx
      );
      expect(patchRes.status).toBe(401);

      const delRes = await stationDELETE(
        new Request("http://localhost:3000/api/admin/data/stations/1", { method: "DELETE" }),
        ctx
      );
      expect(delRes.status).toBe(401);
    });

    it("rejects ANALYST users with 403 Forbidden for station and charger actions", async () => {
      const ctx = { params: Promise.resolve({ id: "1" }) };
      const headers = {
        host: "localhost:3000",
        cookie: `ev_session=${analystToken}`,
        "content-type": "application/json",
      };

      const stPatch = await stationPATCH(
        new Request("http://localhost:3000/api/admin/data/stations/1", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "deactivate" }),
        }),
        ctx
      );
      expect(stPatch.status).toBe(403);

      const chPatch = await chargerPATCH(
        new Request("http://localhost:3000/api/admin/data/chargers/1", {
          method: "PATCH",
          headers,
          body: JSON.stringify({ action: "deactivate" }),
        }),
        ctx
      );
      expect(chPatch.status).toBe(403);
    });

    it("rejects malformed or invalid IDs with 400 Bad Request", async () => {
      const ctx = { params: Promise.resolve({ id: "not-a-number" }) };
      const res = await stationGET(
        new Request("http://localhost:3000/api/admin/data/stations/not-a-number", {
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for nonexistent station or charger IDs", async () => {
      const ctx = { params: Promise.resolve({ id: "999999" }) };
      const res = await stationGET(
        new Request("http://localhost:3000/api/admin/data/stations/999999", {
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );
      expect(res.status).toBe(404);
    });
  });

  // --------------------------------------------------------------------------
  // B. Charging Station Management
  // --------------------------------------------------------------------------
  describe("Charging Station Deactivation & Deletion", () => {
    let testStationId: number;

    beforeAll(async () => {
      // Create an isolated test station for deactivation/reactivation tests
      const res = await query<{ station_id: number }>(
        `INSERT INTO charging_station (station_name, location, total_capacity_kw, operating_status)
         VALUES ('Test Station Stage 8', 'Bellandur EcoSpace, Bengaluru', 120.0, 'ACTIVE')
         RETURNING station_id`
      );
      testStationId = res[0].station_id;
      createdStationIds.push(testStationId);
    });

    it("successfully deactivates a station and updates operating_status to INACTIVE", async () => {
      const ctx = { params: Promise.resolve({ id: String(testStationId) }) };
      const res = await stationPATCH(
        new Request(`http://localhost:3000/api/admin/data/stations/${testStationId}`, {
          method: "PATCH",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({ action: "deactivate" }),
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.station.operatingStatus).toBe("INACTIVE");

      // Verify in database directly
      const rows = await query<{ operating_status: string }>(
        `SELECT operating_status FROM charging_station WHERE station_id = $1`,
        [testStationId]
      );
      expect(rows[0].operating_status).toBe("INACTIVE");
    });

    it("successfully reactivates a station and updates operating_status back to ACTIVE", async () => {
      const ctx = { params: Promise.resolve({ id: String(testStationId) }) };
      const res = await stationPATCH(
        new Request(`http://localhost:3000/api/admin/data/stations/${testStationId}`, {
          method: "PATCH",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({ action: "reactivate" }),
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.station.operatingStatus).toBe("ACTIVE");

      const rows = await query<{ operating_status: string }>(
        `SELECT operating_status FROM charging_station WHERE station_id = $1`,
        [testStationId]
      );
      expect(rows[0].operating_status).toBe("ACTIVE");
    });

    it("blocks permanent deletion of Station #1 because it has dependent chargers, sessions, capacity and telemetry", async () => {
      const ctx = { params: Promise.resolve({ id: "1" }) };
      const res = await stationDELETE(
        new Request(`http://localhost:3000/api/admin/data/stations/1`, {
          method: "DELETE",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );

      expect(res.status).toBe(409);
      const json = await body(res);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("STATION_HAS_DEPENDENCIES");
      expect(json.error.message).toContain("Cannot permanently delete Station #1");
      expect(json.error.message).toContain("deactivate the station instead");

      // Verify Station #1 still exists in database
      const rows = await query<{ station_id: number }>(`SELECT station_id FROM charging_station WHERE station_id = 1`);
      expect(rows.length).toBe(1);
    });

    it("returns accurate dependency counts via GET /api/admin/data/stations/1", async () => {
      const ctx = { params: Promise.resolve({ id: "1" }) };
      const res = await stationGET(
        new Request(`http://localhost:3000/api/admin/data/stations/1`, {
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.canDelete).toBe(false);
      expect(json.data.recommendation).toBe("deactivate");
      expect(json.data.dependencies.chargers).toBeGreaterThan(0);
    });

    it("permanently deletes an eligible station with ZERO dependent records", async () => {
      // Create an isolated empty station
      const ins = await query<{ station_id: number }>(
        `INSERT INTO charging_station (station_name, location, total_capacity_kw, operating_status)
         VALUES ('Standalone Empty Station', 'Sarjapur Road, Bengaluru', 50.0, 'INACTIVE')
         RETURNING station_id`
      );
      const emptyStationId = ins[0].station_id;

      const ctx = { params: Promise.resolve({ id: String(emptyStationId) }) };
      const res = await stationDELETE(
        new Request(`http://localhost:3000/api/admin/data/stations/${emptyStationId}`, {
          method: "DELETE",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.result.deleted).toBe(true);

      // Verify permanently removed from PostgreSQL
      const check = await query(`SELECT station_id FROM charging_station WHERE station_id = $1`, [emptyStationId]);
      expect(check.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // C. Charger Management
  // --------------------------------------------------------------------------
  describe("Charger Deactivation & Deletion", () => {
    let testChargerId: number;

    beforeAll(async () => {
      // Create a test charger under Station 1
      const res = await query<{ charger_id: number }>(
        `INSERT INTO charger (station_id, charger_type, rated_power_kw, status)
         VALUES (1, 'DC_FAST', 60.0, 'AVAILABLE')
         RETURNING charger_id`
      );
      testChargerId = res[0].charger_id;
      createdChargerIds.push(testChargerId);
    });

    it("successfully deactivates a charger and updates status to INACTIVE", async () => {
      const ctx = { params: Promise.resolve({ id: String(testChargerId) }) };
      const res = await chargerPATCH(
        new Request(`http://localhost:3000/api/admin/data/chargers/${testChargerId}`, {
          method: "PATCH",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({ action: "deactivate" }),
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.charger.status).toBe("INACTIVE");

      const rows = await query<{ status: string }>(`SELECT status FROM charger WHERE charger_id = $1`, [testChargerId]);
      expect(rows[0].status).toBe("INACTIVE");
    });

    it("successfully reactivates a charger and updates status back to AVAILABLE", async () => {
      const ctx = { params: Promise.resolve({ id: String(testChargerId) }) };
      const res = await chargerPATCH(
        new Request(`http://localhost:3000/api/admin/data/chargers/${testChargerId}`, {
          method: "PATCH",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({ action: "reactivate" }),
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.charger.status).toBe("AVAILABLE");

      const rows = await query<{ status: string }>(`SELECT status FROM charger WHERE charger_id = $1`, [testChargerId]);
      expect(rows[0].status).toBe("AVAILABLE");
    });

    it("returns accurate dependency counts via GET /api/admin/data/chargers/1", async () => {
      const ctx = { params: Promise.resolve({ id: "1" }) };
      const res = await chargerGET(
        new Request(`http://localhost:3000/api/admin/data/chargers/1`, {
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.canDelete).toBe(false);
      expect(json.data.recommendation).toBe("deactivate");
      expect(json.data.dependencies.sessions).toBeGreaterThan(0);
    });

    it("blocks permanent deletion of Charger #1 because it has dependent charging sessions", async () => {
      const ctx = { params: Promise.resolve({ id: "1" }) };
      const res = await chargerDELETE(
        new Request(`http://localhost:3000/api/admin/data/chargers/1`, {
          method: "DELETE",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );

      expect(res.status).toBe(409);
      const json = await body(res);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("CHARGER_HAS_DEPENDENCIES");
      expect(json.error.message).toContain("Cannot permanently delete Charger #1");

      const rows = await query<{ charger_id: number }>(`SELECT charger_id FROM charger WHERE charger_id = 1`);
      expect(rows.length).toBe(1);
    });

    it("permanently deletes an eligible charger with ZERO dependent sessions", async () => {
      // testChargerId has no sessions
      const ctx = { params: Promise.resolve({ id: String(testChargerId) }) };
      const res = await chargerDELETE(
        new Request(`http://localhost:3000/api/admin/data/chargers/${testChargerId}`, {
          method: "DELETE",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}` },
        }),
        ctx
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.result.deleted).toBe(true);

      const check = await query(`SELECT charger_id FROM charger WHERE charger_id = $1`, [testChargerId]);
      expect(check.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // D. Session Creation Protection (Inactive Station / Charger Guard)
  // --------------------------------------------------------------------------
  describe("Session Creation Protection", () => {
    let inactiveStationId: number;
    let inactiveChargerId: number;

    beforeAll(async () => {
      const st = await query<{ station_id: number }>(
        `INSERT INTO charging_station (station_name, location, total_capacity_kw, operating_status)
         VALUES ('Inactive Station for Guard Test', 'Electronic City Phase 2', 80.0, 'INACTIVE')
         RETURNING station_id`
      );
      inactiveStationId = st[0].station_id;
      createdStationIds.push(inactiveStationId);

      const ch = await query<{ charger_id: number }>(
        `INSERT INTO charger (station_id, charger_type, rated_power_kw, status)
         VALUES ($1, 'AC_FAST', 22.0, 'INACTIVE')
         RETURNING charger_id`,
        [inactiveStationId]
      );
      inactiveChargerId = ch[0].charger_id;
      createdChargerIds.push(inactiveChargerId);
    });

    it("rejects session creation when selected station is INACTIVE with 400 INACTIVE_STATION", async () => {
      const res = await sessionsPOST(
        new Request("http://localhost:3000/api/admin/data/sessions", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            station_id: inactiveStationId,
            charger_id: inactiveChargerId,
            ev_id: 1,
            start_time: new Date().toISOString(),
            energy_kwh: 15.0,
            cost: 150.0,
          }),
        })
      );

      expect(res.status).toBe(400);
      const json = await body(res);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("INACTIVE_STATION");
    });
  });
});
