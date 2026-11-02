import { describe, expect, it } from "vitest";
import { isDatabaseUnavailable, toPublicError } from "@/lib/api/errors";
import { generateReading } from "../scripts/telemetry-simulator";
import { LIVE_TELEMETRY_FRESHNESS_SECONDS } from "@/lib/db/queries/telemetry-mongo";

describe("Stage 7 — System Reliability & Resilience Unit Tests", () => {
  describe("Telemetry Freshness Classification", () => {
    it("defines a positive live telemetry freshness threshold", () => {
      expect(LIVE_TELEMETRY_FRESHNESS_SECONDS).toBeGreaterThan(0);
      expect(LIVE_TELEMETRY_FRESHNESS_SECONDS).toBe(30);
    });

    it("correctly identifies live vs stale reading ages", () => {
      const now = Date.now();

      // Case 1: Reading 5 seconds ago -> Live
      const liveReadingAge = Math.round((now - (now - 5000)) / 1000);
      const isLive = liveReadingAge <= LIVE_TELEMETRY_FRESHNESS_SECONDS;
      expect(isLive).toBe(true);

      // Case 2: Reading 60 seconds ago -> Stale
      const staleReadingAge = Math.round((now - (now - 60000)) / 1000);
      const isStale = staleReadingAge > LIVE_TELEMETRY_FRESHNESS_SECONDS;
      expect(isStale).toBe(true);

      // Case 3: Reading 2 hours ago -> Stale
      const oldReadingAge = Math.round((now - (now - 7200000)) / 1000);
      expect(oldReadingAge > LIVE_TELEMETRY_FRESHNESS_SECONDS).toBe(true);
    });
  });

  describe("Electrical Bounds & Telemetry Simulator Invariants", () => {
    it("strictly clamps simulated voltage within physical operating limits (360V - 460V)", () => {
      for (const scenario of ["diurnal", "normal", "overload"] as const) {
        for (let i = 0; i < 20; i++) {
          const r = generateReading(1, new Date(), scenario);
          expect(r.voltage_v).toBeGreaterThanOrEqual(360);
          expect(r.voltage_v).toBeLessThanOrEqual(460);
        }
      }
    });

    it("strictly clamps simulated frequency within grid stability limits (48.5Hz - 51.5Hz)", () => {
      for (const scenario of ["diurnal", "normal", "overload"] as const) {
        for (let i = 0; i < 20; i++) {
          const r = generateReading(1, new Date(), scenario);
          expect(r.frequency_hz).toBeGreaterThanOrEqual(48.5);
          expect(r.frequency_hz).toBeLessThanOrEqual(51.5);
        }
      }
    });

    it("ensures power, grid load, and current are strictly non-negative", () => {
      for (const scenario of ["diurnal", "normal", "overload"] as const) {
        for (let i = 0; i < 15; i++) {
          const r = generateReading(2, new Date(), scenario);
          expect(r.power_kw).toBeGreaterThanOrEqual(0);
          expect(r.grid_load_kw).toBeGreaterThanOrEqual(0);
          expect(r.current_a).toBeGreaterThanOrEqual(0);
          expect(r.metadata.power_factor).toBeGreaterThan(0.9);
          expect(r.metadata.power_factor).toBeLessThanOrEqual(1.0);
        }
      }
    });

    it("sets overload flag correctly when load exceeds station rated capacity", () => {
      const overloadReading = generateReading(1, new Date(), "overload");
      expect(overloadReading.grid_load_kw).toBeGreaterThan(100);
      expect(overloadReading.metadata.is_overloaded).toBe(true);
    });
  });

  describe("Database Error Classification & Error Sanitization", () => {
    it("recognizes MongoDB driver connection errors as database unavailable", () => {
      const mongoServerErr = new Error("MongoServerSelectionError: connect ECONNREFUSED 127.0.0.1:27017");
      mongoServerErr.name = "MongoServerSelectionError";
      expect(isDatabaseUnavailable(mongoServerErr)).toBe(true);

      const mongoNetworkErr = new Error("MongoNetworkError: connection closed");
      mongoNetworkErr.name = "MongoNetworkError";
      expect(isDatabaseUnavailable(mongoNetworkErr)).toBe(true);

      const mongoTimeoutErr = new Error("Server selection timed out after 5000 ms");
      expect(isDatabaseUnavailable(mongoTimeoutErr)).toBe(true);
    });

    it("recognizes PostgreSQL connection codes as database unavailable", () => {
      expect(isDatabaseUnavailable({ code: "ECONNREFUSED" })).toBe(true);
      expect(isDatabaseUnavailable({ code: "57P01" })).toBe(true);
      expect(isDatabaseUnavailable({ code: "53300" })).toBe(true);
      expect(isDatabaseUnavailable({ code: "08006" })).toBe(true);
    });

    it("sanitizes database outage errors to safe 503 HTTP responses without leaking credentials", () => {
      const err = new Error("MongoServerSelectionError: failed to connect to server [localhost:27017] on socket with secret_token_xyz");
      err.name = "MongoServerSelectionError";
      const pub = toPublicError(err);
      expect(pub.status).toBe(503);
      expect(pub.code).toBe("DATABASE_UNAVAILABLE");
      expect(pub.message).toBe("The database is currently unavailable. Please try again shortly.");
      expect(JSON.stringify(pub)).not.toContain("secret_token_xyz");
      expect(JSON.stringify(pub)).not.toContain("MongoServerSelectionError");
    });
  });
});
