import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/format";
import { getSimulatorInfo } from "@/lib/db/queries/data-admin";

describe("Stage 8 — System Revamp & Reliability Tests", () => {
  describe("Deterministic Time Formatting & Hydration Safety", () => {
    it("consistently formats timestamps with uppercase AM/PM regardless of ICU locale", () => {
      const d1 = new Date("2026-11-03T15:04:25.000Z");
      const formatted = formatTime(d1);
      expect(formatted).toMatch(/^\d{1,2}:\d{2}:\d{2}\s(AM|PM)$/);
      expect(formatted).not.toContain("pm");
      expect(formatted).not.toContain("am");
    });

    it("safely handles null, undefined and invalid dates with dash placeholder", () => {
      expect(formatTime(null)).toBe("—");
      expect(formatTime("invalid-date-string")).toBe("—");
    });
  });

  describe("Simulator Diagnostics & Metadata Contract", () => {
    it("returns a well-formed SimulatorInfo object with valid status and telemetry bounds", async () => {
      const info = await getSimulatorInfo();
      expect(["running", "stopped", "crashed"]).toContain(info.status);
      expect(Array.isArray(info.simulatedStations)).toBe(true);
      expect(info.configuredIntervalMs).toBeGreaterThan(0);
      expect(Array.isArray(info.recentLogs)).toBe(true);

      // Ensures logs do not contain raw unparsed ANSI escape sequences
      for (const log of info.recentLogs) {
        expect(log).not.toMatch(/\x1B\[[0-9;]*[a-zA-Z]/);
      }
    });
  });
});
