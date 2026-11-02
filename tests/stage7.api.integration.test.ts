/**
 * Integration tests for Stage 7 System Integration & API Reliability:
 * Tests the real route handlers for hybrid summary and live telemetry against the database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { GET as hybridSummaryGET } from "@/app/api/stations/[id]/hybrid-summary/route";
import { GET as liveTelemetryGET } from "@/app/api/stations/[id]/live-telemetry/route";
import { cleanupTestUsers, makeTestUser, req, sessionTokenFor } from "./helpers/users";

const hasDb = Boolean(process.env.DATABASE_URL);
type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });
const body = async (res: Response) => JSON.parse(await res.text());

describe.skipIf(!hasDb)("Stage 7 — Hybrid API Integration Tests", () => {
  let token = "";

  beforeAll(async () => {
    await cleanupTestUsers();
    token = await sessionTokenFor(await makeTestUser("ANALYST"));
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await getPool().end();
  });

  describe("GET /api/stations/[id]/hybrid-summary", () => {
    it("returns 401 without authentication or with forged session token", async () => {
      const unauthed = await hybridSummaryGET(req("/api/stations/1/hybrid-summary"), ctx("1"));
      expect(unauthed.status).toBe(401);

      const forged = await hybridSummaryGET(
        req("/api/stations/1/hybrid-summary", { cookie: "forged-token-xyz" }),
        ctx("1"),
      );
      expect(forged.status).toBe(401);
    });

    it("returns 400 for invalid or malformed station IDs", async () => {
      const badAlpha = await hybridSummaryGET(
        req("/api/stations/abc/hybrid-summary", { cookie: token }),
        ctx("abc"),
      );
      expect(badAlpha.status).toBe(400);

      const badZero = await hybridSummaryGET(
        req("/api/stations/0/hybrid-summary", { cookie: token }),
        ctx("0"),
      );
      expect(badZero.status).toBe(400);

      const badNeg = await hybridSummaryGET(
        req("/api/stations/-1/hybrid-summary", { cookie: token }),
        ctx("-1"),
      );
      expect(badNeg.status).toBe(400);
    });

    it("returns 404 for an unknown or nonexistent station ID", async () => {
      const res = await hybridSummaryGET(
        req("/api/stations/9999/hybrid-summary", { cookie: token }),
        ctx("9999"),
      );
      expect(res.status).toBe(404);
      const json = await body(res);
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("returns 200 with standard envelope and no-store headers for a valid station", async () => {
      const res = await hybridSummaryGET(
        req("/api/stations/1/hybrid-summary", { cookie: token }),
        ctx("1"),
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");

      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.localStationId).toBe(1);

      // Verify Open Charge Map curated metadata
      expect(json.data.externalMetadata).not.toBeNull();
      expect(json.data.externalMetadata.externalId).toBe("OCM-103606");
      expect(json.data.externalMetadata.externalSource).toBe("open_charge_map_curated");

      // Verify Regional Grid context (Central Electricity Authority)
      expect(json.data.regionalGrid).not.toBeNull();
      expect(json.data.regionalGrid.source).toBe("central_electricity_authority");
      expect(json.data.regionalGrid.disclaimer).toContain("Central Electricity Authority");

      // Verify Telemetry Freshness & Structure
      expect(json.data.liveTelemetry).toBeDefined();
      expect(["live", "stale", "missing", "unavailable"]).toContain(
        json.data.liveTelemetry.status,
      );
      expect(json.data.sourceSummary.telemetrySource).toBe("simulated");
    });
  });

  describe("GET /api/stations/[id]/live-telemetry", () => {
    it("returns 401 without authentication", async () => {
      const res = await liveTelemetryGET(req("/api/stations/1/live-telemetry"), ctx("1"));
      expect(res.status).toBe(401);
    });

    it("returns 404 for a nonexistent station", async () => {
      const res = await liveTelemetryGET(
        req("/api/stations/9999/live-telemetry", { cookie: token }),
        ctx("9999"),
      );
      expect(res.status).toBe(404);
    });

    it("returns 200 with live telemetry structure for an existing station", async () => {
      const res = await liveTelemetryGET(
        req("/api/stations/1/live-telemetry", { cookie: token }),
        ctx("1"),
      );
      expect(res.status).toBe(200);

      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.data.source).toBe("simulated");
      expect(Array.isArray(json.data.history)).toBe(true);
      expect(json.data.stats).toBeDefined();
      expect(["live", "stale", "missing", "unavailable"]).toContain(json.data.status);
    });
  });
});
