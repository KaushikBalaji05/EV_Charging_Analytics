/**
 * Integration tests: run against the real PostgreSQL database in DATABASE_URL.
 * They assume the repository's own sample data (database/postgresql_sample_data.sql)
 * and migration 002 are loaded. Skipped automatically when DATABASE_URL is not set.
 */
import { afterAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { getHourlyDemand, getKpis, getOverview, getRecentOverloads } from "@/lib/db/queries/overview";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("overview analytics (sample data)", () => {
  afterAll(async () => { await getPool().end(); });

  it("totals sessions, energy and revenue", async () => {
    const k = await getKpis();
    expect(k).toMatchObject({ totalSessions: 3, totalEnergyKwh: 75, totalRevenue: 900, ongoingSessions: 0 });
  });

  it("computes utilization and counts the overload above 100%", async () => {
    const k = await getKpis();
    expect(k.avgUtilizationPct).toBe(90);       // (85 + 105 + 80) / 3
    expect(k.peakUtilizationPct).toBe(105);     // not capped at 100
    expect(k.overloadEvents).toBe(1);
    expect(k.overloadedStations).toBe(1);
  });

  it("spreads session energy across the hours it spans", async () => {
    const h = await getHourlyDemand({});
    expect(h).toHaveLength(24);
    expect(h[9].energyKwh).toBe(35);            // 09:00-10:00, 35 kWh
    expect(h[10].energyKwh).toBe(9);            // half of the 10:00-12:00, 18 kWh session
    expect(h[11].energyKwh).toBe(31);           // 9 + 22
    expect(h.reduce((s, x) => s + x.energyKwh, 0)).toBe(75); // nothing lost or double counted
  });

  it("filters hourly demand by station", async () => {
    const h = await getHourlyDemand({ stationId: 2 });
    expect(h.reduce((s, x) => s + x.energyKwh, 0)).toBe(22);
  });

  it("returns zeros, not errors, for a range with no data", async () => {
    const o = await getOverview({ from: "2026-01-01", to: "2026-01-31" });
    expect(o.kpis.totalSessions).toBe(0);
    expect(o.kpis.avgUtilizationPct).toBeNull();
    expect(o.recentOverloads).toEqual([]);
    expect(o.stations).toHaveLength(2);
  });

  it("includes the whole 'to' day", async () => {
    const o = await getRecentOverloads("2026-10-20", "2026-10-20");
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ stationName: "Central Charging Hub", utilizationPct: 105, overloadKw: 5 });
  });

  it("trigger recomputes utilization and status; rolled back afterwards", async () => {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO station_capacity (station_id, recorded_at, max_load_kw, current_load_kw, utilization_pct, overload_status)
         VALUES (2, '2026-10-21 08:00', 150, 180, 1, 'NORMAL'),
                (2, '2026-10-21 09:00', 150, 150, 5, 'OVERLOADED')
         RETURNING utilization_pct, overload_status`,
      );
      expect(rows[0]).toEqual({ utilization_pct: 120, overload_status: "OVERLOADED" });
      expect(rows[1]).toEqual({ utilization_pct: 100, overload_status: "NORMAL" }); // exactly at limit is not an overload
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });
});
