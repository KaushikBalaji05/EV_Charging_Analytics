import { describe, expect, it } from "vitest";
import { getAllStationMappings, getExternalStationMetadata } from "../src/lib/services/external-metadata";
import { getRegionalGridContext } from "../src/lib/services/regional-grid";

describe("Hybrid Architecture & Data Provenance (Unit Tests)", () => {
  it("maps PostgreSQL station_id to verified Open Charge Map public export IDs", async () => {
    const st1 = await getExternalStationMetadata(1);
    const st2 = await getExternalStationMetadata(2);

    expect(st1).not.toBeNull();
    expect(st1?.localStationId).toBe(1);
    expect(st1?.externalSource).toBe("open_charge_map_curated");
    expect(st1?.externalId).toBe("OCM-103606");
    expect(st1?.retrievalMethod).toBe("curated_public_record");
    expect(st1?.latitude).toBeCloseTo(12.9875, 3);
    expect(st1?.longitude).toBeCloseTo(77.6208, 3);
    expect(st1?.provenanceUrl).toBe(
      "https://raw.githubusercontent.com/openchargemap/ocm-export/main/data/IN/OCM-103606.json",
    );

    expect(st2).not.toBeNull();
    expect(st2?.localStationId).toBe(2);
    expect(st2?.externalSource).toBe("open_charge_map_curated");
    expect(st2?.externalId).toBe("OCM-103604");
    expect(st2?.retrievalMethod).toBe("curated_public_record");
    expect(st2?.latitude).toBeCloseTo(12.9854, 3);
    expect(st2?.longitude).toBeCloseTo(77.7385, 3);
    expect(st2?.provenanceUrl).toBe(
      "https://raw.githubusercontent.com/openchargemap/ocm-export/main/data/IN/OCM-103604.json",
    );
  });

  it("exposes real connector hardware specs matching the raw OCM export records", async () => {
    const st1 = await getExternalStationMetadata(1);
    expect(st1?.connectors.length).toBeGreaterThanOrEqual(1);
    expect(st1?.connectors[0].ratedPowerKw).toBe(3.0);
    expect(st1?.connectors[0].currentType).toBe("AC");
    expect(st1?.totalRatedCapacityKw).toBe(3.0);
    expect(st1?.connectors[0].rawFieldSource).toContain("PowerKW = 3");

    const st2 = await getExternalStationMetadata(2);
    expect(st2?.connectors.length).toBeGreaterThanOrEqual(1);
    expect(st2?.connectors[0].ratedPowerKw).toBe(3.0);
    expect(st2?.totalRatedCapacityKw).toBe(6.0);
    expect(st2?.connectors[0].rawFieldSource).toContain("Quantity = 2");
  });

  it("provides comprehensive verified fields for every curated station", () => {
    const all = getAllStationMappings();
    expect(all.length).toBe(2);
    for (const mapping of all) {
      expect(mapping.verifiedFields.length).toBeGreaterThanOrEqual(5);
      expect(mapping.provenanceUrl).toContain("githubusercontent.com/openchargemap/ocm-export");
      expect(mapping.attribution).toContain("CC BY 4.0");
    }
  });

  it("handles unknown station IDs gracefully with null", async () => {
    const unknown = await getExternalStationMetadata(9999);
    expect(unknown).toBeNull();
  });

  it("retrieves regional grid context from Central Electricity Authority with strict disclaimers", async () => {
    const grid = await getRegionalGridContext();

    expect(grid.source).toBe("central_electricity_authority");
    expect(grid.karnatakaPeakDemandMw).toBeGreaterThan(10000);
    expect(grid.nationalDemandMetMw).toBeGreaterThan(100000);
    expect(grid.disclaimer).toContain("strictly separate from station-level EV load");
    expect(grid.attribution).toContain("Central Electricity Authority");
  });
});
