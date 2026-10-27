/**
 * Integration tests for the Stage 4 query layer against the real PostgreSQL database.
 * Expected values are derived by hand from database/postgresql_sample_data.sql (see comments).
 * Requires migrations 002, 003 and 004. Skipped when DATABASE_URL is not set.
 *
 * Two tests need data the sample set lacks (an ongoing session; an overload with no nearby telemetry).
 * They insert clearly marked rows inside their own describe block and delete them afterwards.
 * Test files run one at a time (vitest.config.mts), so those rows never disturb other files' exact counts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import { getPool, query } from "@/lib/db/pool";
import { getDaily, getDemandAnalytics, getDemandTotals, getHourly } from "@/lib/db/queries/demand";
import { listOverloads } from "@/lib/db/queries/overloads";
import { listSessions } from "@/lib/db/queries/sessions";
import {
  getStationCapacityHistory, getStationChargers, getStationSummary, getStationTelemetry,
  listStationOptions, listStations, rankStations,
} from "@/lib/db/queries/stations";

const hasDb = Boolean(process.env.DATABASE_URL);
const base = { page: 1, pageSize: 20 } as const;
const sessionBase = { ...base, status: "all", sort: "start" } as const;

async function deleteMarkedRows() {
  await query(`DELETE FROM charging_session WHERE ev_id IN (SELECT ev_id FROM ev WHERE registration_no LIKE 'ZZTEST-%')`);
  await query(`DELETE FROM ev WHERE registration_no LIKE 'ZZTEST-%'`);
  await query(`DELETE FROM station_capacity WHERE recorded_at >= '2026-10-22' AND recorded_at < '2026-10-23' AND station_id = 2`);
}

describe.skipIf(!hasDb)("Stage 4 queries (sample data)", () => {
  beforeAll(async () => {
    const [{ ok }] = await query<{ ok: boolean }>(`SELECT to_regclass('public.v_session_details') IS NOT NULL AS ok`);
    if (!ok) throw new Error("Migration 004 is not applied. Run database/migrations/004_session_detail_view.sql first.");
    await deleteMarkedRows(); // clear leftovers of any crashed earlier run
  });
  afterAll(async () => {
    await deleteMarkedRows();
    await getPool().end();
  });

  describe("view v_session_details", () => {
    it("joins session, vehicle, charger and station, with durations computed in minutes", async () => {
      const rows = await query<{ sessionId: number; registrationNo: string; stationName: string; durationMinutes: number; isOngoing: boolean }>(
        `SELECT session_id AS "sessionId", registration_no AS "registrationNo", station_name AS "stationName",
                duration_minutes AS "durationMinutes", is_ongoing AS "isOngoing"
           FROM v_session_details ORDER BY session_id`,
      );
      expect(rows.map((r) => [r.sessionId, r.registrationNo, r.stationName, r.durationMinutes, r.isOngoing])).toEqual([
        [1, "KA01EV1001", "Central Charging Hub", 60, false],   // 09:00-10:00
        [2, "KA01EV1002", "Central Charging Hub", 120, false],  // 10:00-12:00
        [3, "KA01EV1003", "Tech Park Charging Hub", 45, false], // 11:00-11:45
      ]);
    });
  });

  describe("demand analytics", () => {
    it("totals match the sample data (75 kWh, ₹900, 3 sessions)", async () => {
      expect(await getDemandTotals({})).toEqual({ sessions: 3, ongoingSessions: 0, energyKwh: 75, revenue: 900, avgEnergyPerSessionKwh: 25 });
    });
    it("hourly demand splits sessions across the hours they span", async () => {
      const h = await getHourly({});
      expect(h).toHaveLength(24);
      expect([h[9].energyKwh, h[10].energyKwh, h[11].energyKwh]).toEqual([35, 9, 31]);
      expect(h.reduce((s, x) => s + x.energyKwh, 0)).toBe(75);
    });
    it("filters by station", async () => {
      expect((await getDemandTotals({ stationId: 2 })).energyKwh).toBe(22);
      expect((await getHourly({ stationId: 1 })).reduce((s, x) => s + x.energyKwh, 0)).toBe(53);
    });
    it("daily series: open range covers the days with data", async () => {
      const d = await getDaily({});
      expect(d.points).toEqual([{ date: "2026-10-20", sessions: 3, energyKwh: 75, revenue: 900, movingAvgKwh: 75 }]);
      expect(d.truncated).toBe(false);
    });
    it("daily series zero-fills days without sessions and computes the 7-day moving average", async () => {
      const d = await getDaily({ from: "2026-10-19", to: "2026-10-21" });
      expect(d.points.map((p) => p.date)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21"]);
      expect(d.points.map((p) => p.energyKwh)).toEqual([0, 75, 0]);
      expect(d.points.map((p) => p.movingAvgKwh)).toEqual([0, 37.5, 25]); // 0/1, 75/2, 75/3
    });
    it("a range with no data gives zeros and empty peaks, never an error", async () => {
      const a = await getDemandAnalytics({ from: "2026-01-01", to: "2026-01-31" });
      expect(a.totals).toMatchObject({ sessions: 0, energyKwh: 0, revenue: 0, avgEnergyPerSessionKwh: null });
      expect(a.peakHour).toBeNull();
      expect(a.peakDay).toBeNull();
      expect(a.topHours).toEqual([]);
      expect(a.daily.points).toHaveLength(31);
      expect(a.daily.points.every((p) => p.energyKwh === 0)).toBe(true);
    });
    it("derives peak periods and trend from the data", async () => {
      const a = await getDemandAnalytics({});
      expect(a.peakHour).toMatchObject({ hour: 9, energyKwh: 35 });
      expect(a.topHours.map((h) => h.hour)).toEqual([9, 11, 10]);
      expect(a.peakDay).toMatchObject({ date: "2026-10-20", energyKwh: 75 });
      expect(a.trend).toBeNull(); // one day of data is not a trend
      const t = (await getDemandAnalytics({ from: "2026-10-19", to: "2026-10-21" })).trend;
      expect(t).toEqual({ windowDays: 1, recentKwh: 0, previousKwh: 75, changePct: -100 });
    });
    it("caps very long open ranges to the most recent 366 days and says so", async () => {
      const d = await getDaily({ from: "2020-01-01" });
      expect(d.truncated).toBe(true);
      expect(d.points).toHaveLength(366);
      expect(d.points.at(-1)?.date).toBe("2026-10-20");
    });
    it("unknown station is a 404 ApiError", async () => {
      await expect(getDemandAnalytics({ stationId: 9999 })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
      await expect(getHourly({ stationId: 9999 })).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("stations", () => {
    it("lists every station with metrics, ranked by energy by default (hand-checked values)", async () => {
      const r = await listStations({ sort: "energy", ...base });
      expect(r.total).toBe(2);
      const [c, t] = r.rows;
      expect(c).toMatchObject({
        stationId: 1, stationName: "Central Charging Hub", rank: 1, sessions: 2, energyKwh: 53, revenue: 636,
        chargerCount: 2, installedChargerKw: 72, capacityLimitKw: 100,   // 50 + 22 kW installed vs 100 kW permitted
        avgUtilizationPct: 95, peakUtilizationPct: 105, overloadEvents: 1,  // (85 + 105) / 2
        latestUtilizationPct: 105, latestSnapshotAt: "2026-10-20 10:00:00",
      });
      expect(t).toMatchObject({
        stationId: 2, rank: 2, sessions: 1, energyKwh: 22, revenue: 264, chargerCount: 1, installedChargerKw: 100,
        capacityLimitKw: 150, avgUtilizationPct: 80, peakUtilizationPct: 80, overloadEvents: 0,
      });
    });
    it("sorts by every allowlisted key in both directions", async () => {
      const names = async (sort: Parameters<typeof listStations>[0]["sort"], order?: "asc" | "desc") =>
        (await listStations({ sort, order, ...base })).rows.map((r) => r.stationId);
      expect(await names("name")).toEqual([1, 2]);                // A-Z by default
      expect(await names("name", "desc")).toEqual([2, 1]);
      expect(await names("energy", "asc")).toEqual([2, 1]);
      for (const k of ["location", "sessions", "revenue", "utilization", "overloads"] as const) expect(await names(k)).toHaveLength(2);
      expect(await names("overloads")).toEqual([1, 2]);
    });
    it("searches name and location, treating wildcards literally and injection text as plain text", async () => {
      expect((await listStations({ sort: "name", search: "tech park", ...base })).rows.map((r) => r.stationId)).toEqual([2]);
      expect((await listStations({ sort: "name", search: "central", ...base })).total).toBe(1);
      expect((await listStations({ sort: "name", search: "%", ...base })).total).toBe(0);
      expect((await listStations({ sort: "name", search: "_", ...base })).total).toBe(0);
      expect((await listStations({ sort: "name", search: "'; DROP TABLE ev; --", ...base })).total).toBe(0);
      const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM ev`);
      expect(n).toBeGreaterThanOrEqual(3);
    });
    it("filters by status", async () => {
      const [{ s }] = await query<{ s: string }>(`SELECT operating_status AS s FROM charging_station WHERE station_id = 1`);
      expect((await listStations({ sort: "name", status: s as "ACTIVE", ...base })).rows.map((r) => r.stationId)).toContain(1);
      expect((await listStations({ sort: "name", status: "MAINTENANCE", ...base })).total).toBe(0);
    });
    it("paginates: page 2 of size 1, and an out-of-range page returns no rows but the true total", async () => {
      const p2 = await listStations({ sort: "energy", page: 2, pageSize: 1 });
      expect(p2.rows.map((r) => r.stationId)).toEqual([2]);
      expect([p2.total, p2.totalPages]).toEqual([2, 2]);
      const far = await listStations({ sort: "energy", page: 9, pageSize: 1 });
      expect(far.rows).toEqual([]);
      expect(far.total).toBe(2);
    });
    it("a station keeps its global rank when the list is filtered", async () => {
      const r = await listStations({ sort: "energy", search: "tech", ...base });
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].rank).toBe(2);
    });
    it("date filter limits sessions and utilization, but still lists every station", async () => {
      const r = await listStations({ sort: "energy", from: "2026-10-21", ...base });
      expect(r.rows).toHaveLength(2);
      expect(r.rows.every((s) => s.sessions === 0 && s.energyKwh === 0 && s.avgUtilizationPct === null && s.overloadEvents === 0)).toBe(true);
    });
    it("ranking uses RANK() per metric", async () => {
      expect((await rankStations({ metric: "energy", limit: 10 })).map((r) => [r.rank, r.stationId, r.metricValue])).toEqual([[1, 1, 53], [2, 2, 22]]);
      expect((await rankStations({ metric: "utilization", limit: 10 })).map((r) => [r.rank, r.stationId, r.metricValue])).toEqual([[1, 1, 105], [2, 2, 80]]);
      expect((await rankStations({ metric: "sessions", limit: 1 })).map((r) => r.stationId)).toEqual([1]);
      expect((await rankStations({ metric: "revenue", limit: 10 })).map((r) => r.metricValue)).toEqual([636, 264]);
      expect((await rankStations({ metric: "overloads", limit: 10 })).map((r) => r.rank)).toEqual([1, 2]);
    });
    it("station details: summary, chargers, capacity snapshots, telemetry", async () => {
      expect((await getStationSummary(1, {}))?.stationName).toBe("Central Charging Hub");
      expect(await getStationSummary(9999, {})).toBeNull();
      const chargers = await getStationChargers(1, {});
      expect(chargers.map((c) => [c.chargerId, c.sessions, c.energyKwh])).toEqual([[1, 1, 35], [2, 1, 18]]);

      const cap = await getStationCapacityHistory(1, { limit: 10 });
      expect(cap.total).toBe(2);
      expect(cap.rows.map((r) => [r.recordedAt, r.utilizationPct, r.overloadStatus, r.overloadKw])).toEqual([
        ["2026-10-20 10:00:00", 105, "OVERLOADED", 5],
        ["2026-10-20 09:00:00", 85, "NORMAL", 0],
      ]);
      const limited = await getStationCapacityHistory(1, { limit: 1 });
      expect(limited.rows).toHaveLength(1);
      expect(limited.total).toBe(2); // total reflects all matches, not the cap

      const tel = await getStationTelemetry(1, { limit: 10 });
      expect(tel.total).toBeGreaterThanOrEqual(1);
      expect(tel.rows[0]).toHaveProperty("gridLoadKw");
      expect((await getStationTelemetry(1, { from: "2026-01-01", to: "2026-01-02", limit: 10 })).rows).toEqual([]);
    });
    it("lists station options for dropdowns", async () => {
      expect((await listStationOptions()).map((o) => o.stationId)).toEqual([1, 2]);
    });
  });

  describe("overload explorer", () => {
    it("lists the overloaded snapshot with utilization above 100 and the overload amount", async () => {
      const r = await listOverloads({ sort: "time", ...base });
      expect(r.total).toBe(1);
      expect(r.rows[0]).toMatchObject({
        stationId: 1, stationName: "Central Charging Hub", recordedAt: "2026-10-20 10:00:00",
        currentLoadKw: 105, maxLoadKw: 100, utilizationPct: 105, overloadKw: 5,
      });
      expect(r.summary).toEqual({ events: 1, stations: 1, peakUtilizationPct: 105, maxOverloadKw: 5 });
    });
    it("shows the nearest telemetry reading separately from the capacity snapshot", async () => {
      const [row] = (await listOverloads({ sort: "time", ...base })).rows;
      expect(row.telemetryAt).toBe("2026-10-20 10:00:00");
      expect(row.telemetryGridLoadKw).toBe(105);
    });
    it("filters by station and date; empty results carry a zeroed summary", async () => {
      expect((await listOverloads({ sort: "time", stationId: 1, ...base })).total).toBe(1);
      const none = await listOverloads({ sort: "time", stationId: 2, ...base });
      expect(none.rows).toEqual([]);
      expect(none.summary).toEqual({ events: 0, stations: 0, peakUtilizationPct: null, maxOverloadKw: null });
      expect((await listOverloads({ sort: "time", from: "2026-10-21", ...base })).total).toBe(0);
      expect((await listOverloads({ sort: "time", from: "2026-10-20", to: "2026-10-20", ...base })).total).toBe(1);
      await expect(listOverloads({ sort: "time", stationId: 9999, ...base })).rejects.toMatchObject({ status: 404 });
    });

    describe("with an extra 120% overload and no telemetry nearby (temporary row)", () => {
      beforeAll(async () => {
        // The capacity trigger computes utilization_pct = 120 and overload_status = OVERLOADED from the loads.
        await query(`INSERT INTO station_capacity (station_id, recorded_at, max_load_kw, current_load_kw, utilization_pct, overload_status)
                     VALUES (2, '2026-10-22 08:00', 150, 180, 1, 'NORMAL')`);
      });
      afterAll(deleteMarkedRows);

      it("supports utilization above 100%, sorts by it, and reports no nearby telemetry honestly", async () => {
        const r = await listOverloads({ sort: "utilization", ...base });
        expect(r.total).toBe(2);
        expect(r.rows[0]).toMatchObject({ stationId: 2, utilizationPct: 120, overloadKw: 30, telemetryAt: null, telemetryGridLoadKw: null });
        expect(r.rows[1].utilizationPct).toBe(105);
        expect((await listOverloads({ sort: "utilization", order: "asc", ...base })).rows[0].utilizationPct).toBe(105);
        expect((await listOverloads({ sort: "overload", ...base })).rows[0].overloadKw).toBe(30);
        expect(r.summary).toMatchObject({ events: 2, stations: 2, peakUtilizationPct: 120, maxOverloadKw: 30 });
      });
    });
  });

  describe("session explorer", () => {
    const ids = async (extra: Partial<Parameters<typeof listSessions>[0]> = {}) =>
      (await listSessions({ ...sessionBase, ...extra })).rows.map((r) => r.sessionId);

    it("lists sessions newest first with vehicle, station, charger, duration, energy, peak and cost", async () => {
      const r = await listSessions(sessionBase);
      expect(r.rows.map((x) => x.sessionId)).toEqual([3, 2, 1]);
      expect(r.rows[2]).toMatchObject({
        registrationNo: "KA01EV1001", stationName: "Central Charging Hub", chargerId: 1, durationMinutes: 60,
        energyKwh: 35, cost: 420, ongoing: false,
      });
      expect(r.rows[2].peakPowerKw).not.toBeUndefined();
      expect(r.totals).toEqual({ sessions: 3, ongoingSessions: 0, energyKwh: 75, cost: 900 });
    });
    it("sorts by each allowlisted key", async () => {
      expect(await ids({ sort: "energy", order: "asc" })).toEqual([2, 3, 1]);
      expect(await ids({ sort: "cost" })).toEqual([1, 3, 2]);
      expect(await ids({ sort: "duration" })).toEqual([2, 1, 3]);
      expect(await ids({ sort: "start", order: "asc" })).toEqual([1, 2, 3]);
      expect(await ids({ sort: "peak" })).toHaveLength(3);
    });
    it("searches vehicle registration, model and station name", async () => {
      expect(await ids({ search: "KA01EV1001" })).toEqual([1]);
      expect(await ids({ search: "ka01ev100" })).toEqual([3, 2, 1]); // case-insensitive prefix
      expect(await ids({ search: "tata" })).toEqual([3, 1]);
      expect(await ids({ search: "central" })).toEqual([2, 1]);
    });
    it("treats wildcards and injection text as literal text", async () => {
      for (const s of ["%", "_", "\\", "'; DROP TABLE charging_session; --", "' OR '1'='1"]) expect(await ids({ search: s })).toEqual([]);
      const [{ n }] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM charging_session`);
      expect(n).toBeGreaterThanOrEqual(3);
    });
    it("filters by station, charger, status and date range", async () => {
      expect(await ids({ stationId: 2 })).toEqual([3]);
      expect(await ids({ chargerId: 2 })).toEqual([2]);
      expect(await ids({ stationId: 2, chargerId: 1 })).toEqual([]);
      expect(await ids({ status: "completed" })).toEqual([3, 2, 1]);
      expect(await ids({ status: "ongoing" })).toEqual([]);
      expect(await ids({ from: "2026-10-20", to: "2026-10-20" })).toEqual([3, 2, 1]);
      expect(await ids({ from: "2026-10-21" })).toEqual([]);
      expect(await ids({ to: "2026-10-19" })).toEqual([]);
    });
    it("paginates with a true total, and pages past the end are empty", async () => {
      const p2 = await listSessions({ ...sessionBase, page: 2, pageSize: 2 });
      expect(p2.rows.map((r) => r.sessionId)).toEqual([1]);
      expect([p2.total, p2.totalPages, p2.page]).toEqual([3, 2, 2]);
      const far = await listSessions({ ...sessionBase, page: 50, pageSize: 2 });
      expect(far.rows).toEqual([]);
      expect(far.total).toBe(3);
    });
    it("empty results are well-formed", async () => {
      const r = await listSessions({ ...sessionBase, search: "no-such-vehicle" });
      expect(r).toMatchObject({ rows: [], total: 0, totalPages: 1, totals: { sessions: 0, ongoingSessions: 0, energyKwh: 0, cost: 0 } });
    });
    it("unknown station is a 404", async () => {
      await expect(listSessions({ ...sessionBase, stationId: 9999 })).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    });

    describe("with an ongoing session (temporary row: no end_time, no peak power)", () => {
      beforeAll(async () => {
        const [ev] = await query<{ id: number }>(
          `INSERT INTO ev (registration_no, model, battery_capacity_kwh, owner_type) VALUES ('ZZTEST-ONGOING','Test Model',40,'PRIVATE') RETURNING ev_id AS id`);
        await query(
          `INSERT INTO charging_session (ev_id, charger_id, start_time, end_time, energy_kwh, peak_power_kw, cost)
           VALUES ($1, 3, '2026-10-21 08:00', NULL, 5, NULL, 60)`, [ev.id]);
      });
      afterAll(deleteMarkedRows);

      it("is flagged ongoing with null end time and null duration (not zero or negative)", async () => {
        const r = await listSessions({ ...sessionBase, search: "ZZTEST-ONGOING" });
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0]).toMatchObject({ ongoing: true, endTime: null, durationMinutes: null, peakPowerKw: null, energyKwh: 5, cost: 60 });
        expect(r.totals.ongoingSessions).toBe(1);
      });
      it("status filter separates ongoing from completed", async () => {
        expect(await ids({ status: "ongoing" })).toHaveLength(1);
        expect((await ids({ status: "completed" })).length).toBe(3);
        expect((await ids({ status: "all" })).length).toBe(4);
      });
      it("duration sort keeps ongoing sessions last in both directions", async () => {
        const desc = await listSessions({ ...sessionBase, sort: "duration", order: "desc" });
        const asc = await listSessions({ ...sessionBase, sort: "duration", order: "asc" });
        expect(desc.rows.at(-1)?.ongoing).toBe(true);
        expect(asc.rows.at(-1)?.ongoing).toBe(true);
      });
      it("is counted in demand totals and attributed to its start hour and day", async () => {
        const t = await getDemandTotals({});
        expect(t).toMatchObject({ sessions: 4, ongoingSessions: 1, energyKwh: 80 });
        expect((await getHourly({}))[8].energyKwh).toBe(5); // 08:00, all in its start hour
        const day = (await getDaily({ from: "2026-10-21", to: "2026-10-21" })).points[0];
        expect(day).toMatchObject({ date: "2026-10-21", sessions: 1, energyKwh: 5 });
      });
    });
  });
});
