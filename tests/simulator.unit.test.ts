import { describe, expect, it } from "vitest";
import { generateReading } from "../scripts/telemetry-simulator";

describe("Telemetry Simulator Engine (Unit Tests)", () => {
  it("generates readings labeled with source: simulated", () => {
    const reading = generateReading(1, new Date("2026-10-27T10:00:00Z"), "normal");
    expect(reading.source).toBe("simulated");
    expect(reading.station_id).toBe(1);
    expect(reading.recorded_at).toBeInstanceOf(Date);
  });

  it("maintains reasonable electrical consistency: P ≈ sqrt(3) * V * I * pf / 1000", () => {
    const reading = generateReading(1, new Date("2026-10-27T10:00:00Z"), "normal");
    const { voltage_v, current_a, power_kw, metadata } = reading;

    // Computed Power = sqrt(3) * V * I * pf / 1000
    const computedPowerKw = (Math.sqrt(3) * voltage_v * current_a * metadata.power_factor) / 1000;
    // Allow small rounding tolerance due to toFixed(1) and toFixed(2)
    expect(Math.abs(computedPowerKw - power_kw)).toBeLessThan(1.0);
  });

  it("produces load within safe capacity limits under 'normal' scenario", () => {
    for (let i = 0; i < 20; i++) {
      const reading = generateReading(1, new Date(), "normal");
      // Station 1 rated capacity is 100 kW
      expect(reading.grid_load_kw).toBeLessThanOrEqual(100);
      expect(reading.metadata.is_overloaded).toBe(false);
    }
  });

  it("deliberately triggers overload condition under 'overload' scenario", () => {
    for (let i = 0; i < 10; i++) {
      const reading = generateReading(1, new Date(), "overload");
      // Station 1 rated capacity is 100 kW; overload produces > 100 kW
      expect(reading.grid_load_kw).toBeGreaterThan(100);
      expect(reading.metadata.is_overloaded).toBe(true);
    }
  });

  it("keeps grid frequency within realistic Indian grid range (49.70 - 50.30 Hz)", () => {
    for (let i = 0; i < 20; i++) {
      const reading = generateReading(2, new Date(), "diurnal");
      expect(reading.frequency_hz).toBeGreaterThanOrEqual(49.70);
      expect(reading.frequency_hz).toBeLessThanOrEqual(50.30);
    }
  });

  it("supports multiple station IDs (Station 1: 100kW, Station 2: 150kW)", () => {
    const st1 = generateReading(1, new Date(), "normal");
    const st2 = generateReading(2, new Date(), "normal");
    expect(st1.metadata.capacity_kw).toBe(100);
    expect(st2.metadata.capacity_kw).toBe(150);
  });
});
