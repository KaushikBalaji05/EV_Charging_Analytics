/**
 * Stage 7 — Data Administration & Database Management Tests
 * Tests the real route handlers, RBAC, PostgreSQL queries, MongoDB queries,
 * data entry forms, and CSV exports against the real test databases.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, query } from "@/lib/db/pool";
import { GET as overviewGET } from "@/app/api/admin/data/overview/route";
import { GET as tablesGET } from "@/app/api/admin/data/postgres/tables/route";
import { GET as pgRecordsGET } from "@/app/api/admin/data/postgres/records/route";
import { GET as collectionsGET } from "@/app/api/admin/data/mongo/collections/route";
import { GET as mongoRecordsGET } from "@/app/api/admin/data/mongo/records/route";
import { GET as liveTelemetryGET } from "@/app/api/admin/data/telemetry/live/route";
import { GET as optionsGET } from "@/app/api/admin/data/options/route";
import { POST as stationsPOST } from "@/app/api/admin/data/stations/route";
import { POST as sessionsPOST } from "@/app/api/admin/data/sessions/route";
import { serializeToCsv } from "@/lib/db/queries/data-admin";
import { cleanupTestUsers, makeTestUser, req, sessionTokenFor } from "./helpers/users";

const hasDb = Boolean(process.env.DATABASE_URL);
const body = async (res: Response) => JSON.parse(await res.text());

describe.skipIf(!hasDb)("Stage 7 — Data Administration & Database Management Integration", () => {
  let adminToken = "";
  let analystToken = "";
  let createdStationId: number | null = null;
  let createdSessionId: number | null = null;

  beforeAll(async () => {
    await cleanupTestUsers();
    adminToken = await sessionTokenFor(await makeTestUser("ADMIN"));
    analystToken = await sessionTokenFor(await makeTestUser("ANALYST"));
  });

  afterAll(async () => {
    // Cleanup any test stations or sessions inserted
    if (createdSessionId) {
      await query(`DELETE FROM charging_session WHERE session_id = $1`, [createdSessionId]).catch(() => {});
    }
    if (createdStationId) {
      await query(`DELETE FROM charging_station WHERE station_id = $1`, [createdStationId]).catch(() => {});
    }
    await cleanupTestUsers();
    await getPool().end();
  });

  // ==========================================================================
  // 1. RBAC & Access Control
  // ==========================================================================
  describe("Security & Role-Based Access Control", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await overviewGET(req("/api/admin/data/overview"));
      expect(res.status).toBe(401);
    });

    it("rejects ANALYST users with 403 Forbidden for all admin data endpoints", async () => {
      const r1 = await overviewGET(req("/api/admin/data/overview", { cookie: analystToken }));
      expect(r1.status).toBe(403);

      const r2 = await tablesGET(req("/api/admin/data/postgres/tables", { cookie: analystToken }));
      expect(r2.status).toBe(403);

      const r3 = await stationsPOST(
        req("/api/admin/data/stations", {
          method: "POST",
          cookie: analystToken,
          headers: { "content-type": "application/json" },
        })
      );
      expect(r3.status).toBe(403);
    });

    it("allows ADMIN users access to overview and records", async () => {
      const res = await overviewGET(req("/api/admin/data/overview", { cookie: adminToken }));
      expect(res.status).toBe(200);
      const data = await body(res);
      expect(data.ok).toBe(true);
      expect(data.data.postgres.status).toBe("connected");
      expect(data.data.mongodb.status).toBe("connected");
    });
  });

  // ==========================================================================
  // 2. Database Overview & Health Checks
  // ==========================================================================
  describe("Database Health & Infrastructure Overview", () => {
    it("reports live PostgreSQL database details and operational table counts", async () => {
      const res = await overviewGET(req("/api/admin/data/overview", { cookie: adminToken }));
      expect(res.status).toBe(200);
      const { data } = await body(res);

      expect(data.postgres.type).toBe("postgresql");
      expect(data.postgres.status).toBe("connected");
      expect(data.postgres.latencyMs).toBeTypeOf("number");
      expect(data.postgres.stats.tables).toBeDefined();
      expect(data.postgres.stats.tables.charging_station).toBeGreaterThanOrEqual(2);
    });

    it("reports live MongoDB status, collection counts, and telemetry statistics", async () => {
      const res = await overviewGET(req("/api/admin/data/overview", { cookie: adminToken }));
      expect(res.status).toBe(200);
      const { data } = await body(res);

      expect(data.mongodb.type).toBe("mongodb");
      expect(data.mongodb.status).toBe("connected");
      expect(data.mongodb.stats.telemetryCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(data.mongodb.stats.distinctStations)).toBe(true);
    });

    it("reports telemetry simulator status and configuration", async () => {
      const res = await overviewGET(req("/api/admin/data/overview", { cookie: adminToken }));
      const { data } = await body(res);

      expect(data.simulator).toBeDefined();
      expect(["running", "stopped"]).toContain(data.simulator.status);
      expect(data.simulator.configuredIntervalMs).toBe(5000);
      expect(Array.isArray(data.simulator.simulatedStations)).toBe(true);
    });
  });

  // ==========================================================================
  // 3. PostgreSQL Table Explorer
  // ==========================================================================
  describe("PostgreSQL Table Explorer", () => {
    it("lists allowlisted tables and views", async () => {
      const res = await tablesGET(req("/api/admin/data/postgres/tables", { cookie: adminToken }));
      expect(res.status).toBe(200);
      const { data } = await body(res);

      expect(Array.isArray(data.tables)).toBe(true);
      const tableNames = data.tables.map((t: { table: string }) => t.table);
      expect(tableNames).toContain("charging_station");
      expect(tableNames).toContain("charging_session");
      expect(tableNames).toContain("charger");
      expect(tableNames).toContain("ev");
      expect(tableNames).toContain("app_user");
      expect(tableNames).toContain("auth_session");
    });

    it("redacts sensitive argon2 password hashes when querying app_user", async () => {
      const res = await pgRecordsGET(
        req("/api/admin/data/postgres/records?table=app_user&page=1&limit=5", { cookie: adminToken })
      );
      expect(res.status).toBe(200);
      const { data } = await body(res);
      expect(data.rows.length).toBeGreaterThan(0);
      for (const row of data.rows) {
        expect(row.password_hash).toBe("[PROTECTED_ARGON2_HASH]");
      }
    });

    it("rejects unauthorized or arbitrary table names with 400", async () => {
      const res = await pgRecordsGET(
        req("/api/admin/data/postgres/records?table=secret_passwords", { cookie: adminToken })
      );
      expect(res.status).toBe(400);
      const json = await body(res);
      expect(json.error.code).toBe("INVALID_TABLE");
    });

    it("queries paginated records and column metadata from allowlisted table", async () => {
      const res = await pgRecordsGET(
        req("/api/admin/data/postgres/records?table=charging_station&page=1&limit=5", { cookie: adminToken })
      );
      expect(res.status).toBe(200);
      const { data } = await body(res);

      expect(data.table).toBe("charging_station");
      expect(data.page).toBe(1);
      expect(data.limit).toBe(5);
      expect(Array.isArray(data.columns)).toBe(true);
      expect(Array.isArray(data.rows)).toBe(true);

      const pkCol = data.columns.find((c: { isPrimaryKey: boolean }) => c.isPrimaryKey);
      expect(pkCol?.name).toBe("station_id");
    });

    it("supports search filtering and sorting", async () => {
      const res = await pgRecordsGET(
        req(
          "/api/admin/data/postgres/records?table=charging_station&search=Bengaluru&sortBy=station_name&sortOrder=asc",
          { cookie: adminToken }
        )
      );
      expect(res.status).toBe(200);
      const { data } = await body(res);
      expect(data.rows.length).toBeGreaterThanOrEqual(1);
    });

    it("exports table records as CSV with attachment headers", async () => {
      const res = await pgRecordsGET(
        req("/api/admin/data/postgres/records?table=charging_station&export=csv", { cookie: adminToken })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain("charging_station_export.csv");

      const text = await res.text();
      expect(text).toContain("station_id");
      expect(text).toContain("station_name");
      expect(text).toContain("total_capacity_kw");
    });
  });

  // ==========================================================================
  // 4. MongoDB Collection Explorer
  // ==========================================================================
  describe("MongoDB Collection Explorer", () => {
    it("lists allowlisted collections", async () => {
      const res = await collectionsGET(req("/api/admin/data/mongo/collections", { cookie: adminToken }));
      expect(res.status).toBe(200);
      const { data } = await body(res);
      expect(data.collections[0].name).toBe("grid_telemetry");
      expect(data.collections[0].count).toBeGreaterThanOrEqual(1);
    });

    it("rejects unauthorized collections with 400", async () => {
      const res = await mongoRecordsGET(
        req("/api/admin/data/mongo/records?collection=system.users", { cookie: adminToken })
      );
      expect(res.status).toBe(400);
      const json = await body(res);
      expect(json.error.code).toBe("INVALID_COLLECTION");
    });

    it("queries paginated telemetry documents sorted by timestamp descending", async () => {
      const res = await mongoRecordsGET(
        req("/api/admin/data/mongo/records?collection=grid_telemetry&page=1&limit=5", { cookie: adminToken })
      );
      expect(res.status).toBe(200);
      const { data } = await body(res);

      expect(data.collection).toBe("grid_telemetry");
      expect(data.documents.length).toBeGreaterThanOrEqual(1);
      const doc = data.documents[0];
      expect(doc.station_id).toBeDefined();
      expect(doc.recorded_at).toBeDefined();
      expect(doc.voltage_v).toBeDefined();
      expect(doc.power_kw).toBeDefined();
      expect(doc.source).toBe("simulated");
    });

    it("filters telemetry by station_id", async () => {
      const res = await mongoRecordsGET(
        req("/api/admin/data/mongo/records?collection=grid_telemetry&stationId=1&limit=5", { cookie: adminToken })
      );
      expect(res.status).toBe(200);
      const { data } = await body(res);
      for (const d of data.documents) {
        expect(d.station_id).toBe(1);
      }
    });

    it("exports MongoDB documents to CSV with flattened metadata", async () => {
      const res = await mongoRecordsGET(
        req("/api/admin/data/mongo/records?collection=grid_telemetry&export=csv", { cookie: adminToken })
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toContain("grid_telemetry_export.csv");

      const text = await res.text();
      expect(text).toContain("station_id");
      expect(text).toContain("voltage_v");
      expect(text).toContain("power_kw");
    });
  });

  // ==========================================================================
  // 5. Live Telemetry Monitor
  // ==========================================================================
  describe("Live Telemetry Monitor API", () => {
    it("returns latest reading per station and chronological trend buffer", async () => {
      const res = await liveTelemetryGET(req("/api/admin/data/telemetry/live", { cookie: adminToken }));
      expect(res.status).toBe(200);
      const { data } = await body(res);

      expect(Array.isArray(data.latest)).toBe(true);
      expect(Array.isArray(data.trend)).toBe(true);
      expect(data.simulator).toBeDefined();

      if (data.latest.length > 0) {
        // Station 1 has active telemetry in MongoDB
        const streamingItem = data.latest.find((i: { stationId: number; hasTelemetry: boolean }) => i.stationId === 1);
        if (streamingItem && streamingItem.hasTelemetry) {
          expect(streamingItem.stationId).toBe(1);
          expect(streamingItem.powerKw).toBeTypeOf("number");
          expect(streamingItem.gridLoadKw).toBeTypeOf("number");
          expect(streamingItem.source).toBe("simulated");
        }

        // Stations without telemetry report clear NO_TELEMETRY status and null readings
        const idleItem = data.latest.find((i: { hasTelemetry: boolean }) => !i.hasTelemetry);
        if (idleItem) {
          expect(idleItem.hasTelemetry).toBe(false);
          expect(idleItem.status).toBe("NO_TELEMETRY");
          expect(idleItem.powerKw).toBeNull();
        }
      }
    });
  });

  // ==========================================================================
  // 6. Controlled Data Entry & Mutation Validation
  // ==========================================================================
  describe("Controlled Data Entry (Stations & Sessions)", () => {
    it("fetches form options with stations, chargers, and EVs", async () => {
      const res = await optionsGET(req("/api/admin/data/options", { cookie: adminToken }));
      expect(res.status).toBe(200);
      const { data } = await body(res);

      expect(data.stations.length).toBeGreaterThanOrEqual(2);
      expect(data.chargers.length).toBeGreaterThanOrEqual(2);
      expect(data.evs.length).toBeGreaterThanOrEqual(2);
    });

    it("rejects invalid station insertion (e.g. non-positive capacity or missing fields)", async () => {
      const res = await stationsPOST(
        new Request("http://localhost:3000/api/admin/data/stations", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            station_name: "",
            location: "Test Location",
            total_capacity_kw: -50, // invalid negative
            operating_status: "INVALID_STATUS", // invalid enum
          }),
        })
      );
      expect(res.status).toBe(400);
    });

    it("rejects malformed JSON and oversized request bodies on data entry endpoints", async () => {
      // Malformed JSON
      const malformedRes = await stationsPOST(
        new Request("http://localhost:3000/api/admin/data/stations", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: "{not-valid-json",
        })
      );
      expect(malformedRes.status).toBe(400);
      const malformedJson = await body(malformedRes);
      expect(malformedJson.error.code).toBe("INVALID_JSON");

      // Oversized body (>10,000 characters)
      const oversizedRes = await stationsPOST(
        new Request("http://localhost:3000/api/admin/data/stations", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: "x".repeat(10_001),
        })
      );
      expect(oversizedRes.status).toBe(413);
      const oversizedJson = await body(oversizedRes);
      expect(oversizedJson.error.code).toBe("BODY_TOO_LARGE");
    });

    it("inserts a valid charging station and verifies persistence in PostgreSQL", async () => {
      const stationPayload = {
        station_name: `Stage 7 Test Station ${Date.now()}`,
        location: "Koramangala 5th Block, Bengaluru",
        total_capacity_kw: 175.0,
        operating_status: "ACTIVE",
      };

      const res = await stationsPOST(
        new Request("http://localhost:3000/api/admin/data/stations", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify(stationPayload),
        })
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.stationId).toBeTypeOf("number");
      createdStationId = json.data.stationId;

      // Verify row exists directly in PostgreSQL
      const rows = await query<{ station_name: string; total_capacity_kw: number }>(
        `SELECT station_name, total_capacity_kw FROM charging_station WHERE station_id = $1`,
        [createdStationId]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].station_name).toBe(stationPayload.station_name);
      expect(rows[0].total_capacity_kw).toBe(175.0);

      // Clean up test station immediately so concurrent test workers are not affected
      await query(`DELETE FROM charging_station WHERE station_id = $1`, [createdStationId]);
      createdStationId = null;
    });

    it("rejects invalid charging session (e.g. charger not belonging to station)", async () => {
      const res = await sessionsPOST(
        new Request("http://localhost:3000/api/admin/data/sessions", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            station_id: 1,
            charger_id: 3, // Charger 3 belongs to Station 2, not Station 1!
            ev_id: 1,
            start_time: new Date().toISOString(),
            energy_kwh: 30,
            cost: 350,
          }),
        })
      );
      expect(res.status).toBe(400);
      const json = await body(res);
      expect(json.error.code).toBe("INVALID_CHARGER");
    });

    it("rejects session where end_time is earlier than start_time", async () => {
      const res = await sessionsPOST(
        new Request("http://localhost:3000/api/admin/data/sessions", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify({
            station_id: 1,
            charger_id: 1,
            ev_id: 1,
            start_time: "2026-11-02T12:00:00Z",
            end_time: "2026-11-02T10:00:00Z", // Earlier than start!
            energy_kwh: 20,
            cost: 200,
          }),
        })
      );
      expect(res.status).toBe(400);
    });

    it("inserts a valid charging session and verifies persistence in PostgreSQL", async () => {
      const sessionPayload = {
        station_id: 1,
        charger_id: 1, // Valid charger for Station 1
        ev_id: 1,
        start_time: "2026-11-02T08:00:00Z",
        end_time: "2026-11-02T09:15:00Z",
        energy_kwh: 38.5,
        peak_power_kw: 49.0,
        cost: 450.0,
      };

      const res = await sessionsPOST(
        new Request("http://localhost:3000/api/admin/data/sessions", {
          method: "POST",
          headers: { host: "localhost:3000", cookie: `ev_session=${adminToken}`, "content-type": "application/json" },
          body: JSON.stringify(sessionPayload),
        })
      );

      expect(res.status).toBe(200);
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.sessionId).toBeTypeOf("number");
      createdSessionId = json.data.sessionId;

      // Verify row exists directly in PostgreSQL
      const rows = await query<{ session_id: number; energy_kwh: number; cost: number }>(
        `SELECT session_id, energy_kwh, cost FROM charging_session WHERE session_id = $1`,
        [createdSessionId]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].energy_kwh).toBe(38.5);
      expect(rows[0].cost).toBe(450.0);

      // Clean up test session immediately so concurrent test workers are not affected
      await query(`DELETE FROM charging_session WHERE session_id = $1`, [createdSessionId]);
      createdSessionId = null;
    });
  });

  // ==========================================================================
  // 7. CSV Export & Formula Injection Prevention
  // ==========================================================================
  describe("CSV Serializer & Security Sanitization", () => {
    it("escapes fields containing commas, double quotes, and newlines per RFC 4180", () => {
      const data = [
        { id: 1, name: 'Normal Name', notes: 'Comma, separated' },
        { id: 2, name: 'Quote "Test"', notes: 'Line 1\nLine 2' },
      ];
      const csv = serializeToCsv(data);
      expect(csv).toContain('"Comma, separated"');
      expect(csv).toContain('"Quote ""Test"""');
      expect(csv).toContain('"Line 1\nLine 2"');
    });

    it("mitigates CSV formula injection by prepending apostrophes to leading =, +, -, @", () => {
      const dangerousData = [
        { id: 1, title: '=cmd|/c calc!A1' },
        { id: 2, title: '+12345' },
        { id: 3, title: '-999' },
        { id: 4, title: '@SUM(1,2)' },
      ];
      const csv = serializeToCsv(dangerousData);
      expect(csv).toContain("'=cmd|/c calc!A1");
      expect(csv).toContain("'+12345");
      expect(csv).toContain("'-999");
      expect(csv).toContain("'@SUM(1,2)");
    });
  });
});
