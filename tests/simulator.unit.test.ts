import { describe, expect, it } from "vitest";
import { generateReading, resolveTargetStations, STATION_SPECS } from "../scripts/telemetry-simulator";

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

    const computedPowerKw = (Math.sqrt(3) * voltage_v * current_a * metadata.power_factor) / 1000;
    expect(Math.abs(computedPowerKw - power_kw)).toBeLessThan(1.0);
  });

  it("produces load within safe capacity limits under 'normal' scenario", () => {
    for (let i = 0; i < 20; i++) {
      const reading = generateReading(1, new Date(), "normal");
      expect(reading.grid_load_kw).toBeLessThanOrEqual(100);
      expect(reading.metadata.is_overloaded).toBe(false);
    }
  });

  it("deliberately triggers overload condition under 'overload' scenario", () => {
    for (let i = 0; i < 10; i++) {
      const reading = generateReading(1, new Date(), "overload");
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

  it("supports extended station specs up to 20 stations with realistic Bengaluru hub names and capacities", () => {
    expect(Object.keys(STATION_SPECS).length).toBeGreaterThanOrEqual(20);
    expect(STATION_SPECS[3].name).toBe("Indiranagar 100ft Rd Hub");
    expect(STATION_SPECS[3].capacityKw).toBe(120);
    expect(STATION_SPECS[4].name).toBe("Koramangala 4th Block Hub");
    expect(STATION_SPECS[4].capacityKw).toBe(150);
    expect(STATION_SPECS[5].name).toBe("Electronic City Phase 1 Hub");
    expect(STATION_SPECS[5].capacityKw).toBe(200);
    expect(STATION_SPECS[6].name).toBe("Whitefield ITPL Hub");
    expect(STATION_SPECS[6].capacityKw).toBe(180);

    const st3 = generateReading(3, new Date(), "normal");
    expect(st3.metadata.station_name).toBe("Indiranagar 100ft Rd Hub");
    expect(st3.metadata.capacity_kw).toBe(120);

    const st5 = generateReading(5, new Date(), "normal");
    expect(st5.metadata.station_name).toBe("Electronic City Phase 1 Hub");
    expect(st5.metadata.capacity_kw).toBe(200);
  });

  it("resolves target stations honoring explicit station list and custom specs", async () => {
    const resolved = await resolveTargetStations([1, 2, 3, 4, 5, 6]);
    expect(resolved.stations).toEqual([1, 2, 3, 4, 5, 6]);
    expect(resolved.specs[3].capacityKw).toBe(120);

    const customReading = generateReading(999, new Date(), "normal", {
      999: { name: "Custom Solar Hub", capacityKw: 350, voltageNominal: 415 },
    });
    expect(customReading.metadata.station_name).toBe("Custom Solar Hub");
    expect(customReading.metadata.capacity_kw).toBe(350);
  });
});
