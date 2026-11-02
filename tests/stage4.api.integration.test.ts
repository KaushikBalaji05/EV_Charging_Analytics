/**
 * API tests for the Stage 4 endpoints: the REAL route handlers against the REAL database.
 * Checks authentication, validation, 404s, allowlists, response shape, and that no internals leak.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool } from "@/lib/db/pool";
import { GET as demandHourly } from "@/app/api/demand/hourly/route";
import { GET as demandDaily } from "@/app/api/demand/daily/route";
import { GET as stationsList } from "@/app/api/stations/route";
import { GET as stationsRanking } from "@/app/api/stations/ranking/route";
import { GET as stationDetail } from "@/app/api/stations/[id]/route";
import { GET as stationTelemetry } from "@/app/api/stations/[id]/telemetry/route";
import { GET as stationCapacity } from "@/app/api/stations/[id]/capacity/route";
import { GET as stationOverloads } from "@/app/api/stations/[id]/overloads/route";
import { GET as overloadsList } from "@/app/api/overloads/route";
import { GET as sessionsList } from "@/app/api/sessions/route";
import { cleanupTestUsers, makeTestUser, req, sessionTokenFor } from "./helpers/users";

const hasDb = Boolean(process.env.DATABASE_URL);
type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });
const body = async (res: Response) => JSON.parse(await res.text());

interface Endpoint {
  name: string;
  path: string; // with a valid example query
  call: (r: Request) => Promise<Response>;
}
const ENDPOINTS: Endpoint[] = [
  { name: "GET /api/demand/hourly", path: "/api/demand/hourly", call: demandHourly },
  { name: "GET /api/demand/daily", path: "/api/demand/daily", call: demandDaily },
  { name: "GET /api/stations", path: "/api/stations", call: stationsList },
  { name: "GET /api/stations/ranking", path: "/api/stations/ranking", call: stationsRanking },
  { name: "GET /api/stations/[id]", path: "/api/stations/1", call: (r) => stationDetail(r, ctx("1")) },
  { name: "GET /api/stations/[id]/telemetry", path: "/api/stations/1/telemetry", call: (r) => stationTelemetry(r, ctx("1")) },
  { name: "GET /api/stations/[id]/capacity", path: "/api/stations/1/capacity", call: (r) => stationCapacity(r, ctx("1")) },
  { name: "GET /api/stations/[id]/overloads", path: "/api/stations/1/overloads", call: (r) => stationOverloads(r, ctx("1")) },
  { name: "GET /api/overloads", path: "/api/overloads", call: overloadsList },
  { name: "GET /api/sessions", path: "/api/sessions", call: sessionsList },
];

describe.skipIf(!hasDb)("Stage 4 API (real handlers, real database)", () => {
  let token = "";

  beforeAll(async () => {
    await cleanupTestUsers();
    token = await sessionTokenFor(await makeTestUser("ANALYST"));
  });
  afterAll(async () => {
    await cleanupTestUsers();
    await getPool().end();
  });

  describe.each(ENDPOINTS)("$name", ({ path, call }) => {
    it("returns 401 without a session and with a forged one", async () => {
      const anon = await call(req(path));
      expect(anon.status).toBe(401);
      expect((await body(anon)).error.code).toBe("UNAUTHENTICATED");
      expect((await call(req(path, { cookie: "A".repeat(43) }))).status).toBe(401);
    });
    it("returns 200 with the standard envelope and no-store caching for an analyst", async () => {
      const res = await call(req(path, { cookie: token }));
      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      const json = await body(res);
      expect(json.ok).toBe(true);
      expect(json.meta).toMatchObject({ source: "postgresql" });
      expect(["demo", "production"]).toContain(json.meta.dataMode);
      expect(json).toHaveProperty("data");
    });
    it("rejects a malformed date with 400 and field details, without leaking internals", async () => {
      const res = await call(req(`${path}?from=not-a-date`, { cookie: token }));
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(JSON.parse(text).error).toMatchObject({ code: "INVALID_INPUT", details: [{ field: "from" }] });
      expect(text).not.toMatch(/select |from charging|pg_|postgres|stack|at .*\.ts/i);
    });
    it("rejects an inverted date range with 400", async () => {
      expect((await call(req(`${path}?from=2026-10-25&to=2026-10-20`, { cookie: token }))).status).toBe(400);
    });
  });

  describe("station-scoped routes", () => {
    const scoped: [string, (r: Request, c: Ctx) => Promise<Response>][] = [
      ["detail", stationDetail], ["telemetry", stationTelemetry], ["capacity", stationCapacity], ["overloads", stationOverloads],
    ];
    it.each(scoped)("%s: unknown station is 404, invalid id is 400", async (_n, handler) => {
      const missing = await handler(req("/api/stations/9999", { cookie: token }), ctx("9999"));
      expect(missing.status).toBe(404);
      expect((await body(missing)).error.code).toBe("NOT_FOUND");
      for (const bad of ["abc", "0", "-1", "1.5", "1;DROP TABLE ev"]) {
        expect((await handler(req("/api/stations/x", { cookie: token }), ctx(bad))).status).toBe(400);
      }
    });
  });

  describe("filter-by-station routes report unknown stations as 404 and bad ids as 400", () => {
    it.each(["/api/demand/hourly", "/api/demand/daily", "/api/overloads", "/api/sessions"])("%s", async (path) => {
      const call = ENDPOINTS.find((e) => e.path === path)!.call;
      expect((await call(req(`${path}?station_id=9999`, { cookie: token }))).status).toBe(404);
      expect((await call(req(`${path}?station_id=abc`, { cookie: token }))).status).toBe(400);
      expect((await call(req(`${path}?station_id=0`, { cookie: token }))).status).toBe(400);
    });
  });

  describe("sessions charger_id filter", () => {
    it("returns 404 for an unknown charger_id (F7: consistent with station_id behaviour)", async () => {
      expect((await sessionsList(req("/api/sessions?charger_id=9999", { cookie: token }))).status).toBe(404);
    });
    it("returns 400 for a non-integer or out-of-range charger_id", async () => {
      expect((await sessionsList(req("/api/sessions?charger_id=abc", { cookie: token }))).status).toBe(400);
      expect((await sessionsList(req("/api/sessions?charger_id=0", { cookie: token }))).status).toBe(400);
      expect((await sessionsList(req("/api/sessions?charger_id=-1", { cookie: token }))).status).toBe(400);
    });
    it("returns 200 with matching sessions for a valid charger_id", async () => {
      const res = await sessionsList(req("/api/sessions?charger_id=1", { cookie: token }));
      expect(res.status).toBe(200);
      const { data } = await body(res);
      expect(Array.isArray(data.rows)).toBe(true);
    });
  });

  describe("allowlists and bounds", () => {
    it("rejects sort/metric values outside the allowlist, including injection attempts", async () => {
      for (const q of ["sort=password_hash", "sort=energy;DROP TABLE ev", "sort=1 OR 1=1", "order=sideways", "status=hacked", "page=0", "page=-2", "page=abc", "page_size=0", "page_size=101", "page_size=1000"]) {
        const res = await stationsList(req(`/api/stations?${q}`, { cookie: token }));
        expect(res.status, q).toBe(400);
      }
      expect((await stationsRanking(req("/api/stations/ranking?metric=cost", { cookie: token }))).status).toBe(400);
      expect((await stationsRanking(req("/api/stations/ranking?limit=51", { cookie: token }))).status).toBe(400);
      expect((await overloadsList(req("/api/overloads?sort=station", { cookie: token }))).status).toBe(400);
      expect((await sessionsList(req("/api/sessions?sort=end_time", { cookie: token }))).status).toBe(400);
      expect((await sessionsList(req("/api/sessions?status=done", { cookie: token }))).status).toBe(400);
      expect((await sessionsList(req(`/api/sessions?q=${"x".repeat(101)}`, { cookie: token }))).status).toBe(400);
      expect((await stationTelemetry(req("/api/stations/1/telemetry?limit=1001", { cookie: token }), ctx("1"))).status).toBe(400);
    });
    it("every allowed sort and metric works", async () => {
      for (const sort of ["name", "location", "energy", "sessions", "revenue", "utilization", "overloads"]) {
        expect((await stationsList(req(`/api/stations?sort=${sort}&order=asc`, { cookie: token }))).status, sort).toBe(200);
      }
      for (const metric of ["energy", "sessions", "revenue", "utilization", "overloads"]) {
        expect((await stationsRanking(req(`/api/stations/ranking?metric=${metric}`, { cookie: token }))).status, metric).toBe(200);
      }
      for (const sort of ["time", "utilization", "overload"]) expect((await overloadsList(req(`/api/overloads?sort=${sort}`, { cookie: token }))).status, sort).toBe(200);
      for (const sort of ["start", "energy", "cost", "duration", "peak"]) expect((await sessionsList(req(`/api/sessions?sort=${sort}`, { cookie: token }))).status, sort).toBe(200);
    });
  });

  describe("returned data (sample dataset)", () => {
    it("/api/stations: metrics, ranking and pagination fields", async () => {
      const { data } = await body(await stationsList(req("/api/stations?page_size=1&page=2", { cookie: token })));
      expect(data).toMatchObject({ total: 2, page: 2, pageSize: 1, totalPages: 2 });
      expect(data.rows[0]).toMatchObject({ stationId: 2, rank: 2, energyKwh: 22 });
    });
    it("/api/stations/ranking", async () => {
      const { data } = await body(await stationsRanking(req("/api/stations/ranking?metric=utilization", { cookie: token })));
      expect(data.map((r: { rank: number; stationId: number; metricValue: number }) => [r.rank, r.stationId, r.metricValue])).toEqual([[1, 1, 105], [2, 2, 80]]);
    });
    it("/api/stations/[id]: station summary with chargers", async () => {
      const { data } = await body(await stationDetail(req("/api/stations/1", { cookie: token }), ctx("1")));
      expect(data.station).toMatchObject({ stationName: "Central Charging Hub", sessions: 2, installedChargerKw: 72, capacityLimitKw: 100 });
      expect(data.chargers).toHaveLength(2);
    });
    it("/api/stations/[id]/capacity keeps utilization above 100 and /telemetry is a separate series", async () => {
      const cap = (await body(await stationCapacity(req("/api/stations/1/capacity", { cookie: token }), ctx("1")))).data;
      expect(cap.rows[0]).toMatchObject({ utilizationPct: 105, overloadStatus: "OVERLOADED", overloadKw: 5 });
      const tel = (await body(await stationTelemetry(req("/api/stations/1/telemetry", { cookie: token }), ctx("1")))).data;
      expect(tel.rows[0]).toHaveProperty("voltageV");
      expect(tel.rows[0]).not.toHaveProperty("utilizationPct");
    });
    it("/api/overloads and /api/stations/[id]/overloads", async () => {
      const all = (await body(await overloadsList(req("/api/overloads", { cookie: token })))).data;
      expect(all.summary).toEqual({ events: 1, stations: 1, peakUtilizationPct: 105, maxOverloadKw: 5 });
      const st2 = (await body(await stationOverloads(req("/api/stations/2/overloads", { cookie: token }), ctx("2")))).data;
      expect(st2.rows).toEqual([]);
      expect(st2.total).toBe(0);
    });
    it("/api/sessions: search, status, filter and totals", async () => {
      const q = (await body(await sessionsList(req("/api/sessions?q=nexon&status=completed", { cookie: token })))).data;
      expect(q.rows.map((r: { sessionId: number }) => r.sessionId)).toEqual([1]);
      expect(q.totals).toMatchObject({ sessions: 1, energyKwh: 35, cost: 420 });
      const none = (await body(await sessionsList(req("/api/sessions?from=2027-01-01", { cookie: token })))).data;
      expect(none).toMatchObject({ rows: [], total: 0, totalPages: 1 });
    });
    it("/api/demand/hourly and /daily", async () => {
      const hourly = (await body(await demandHourly(req("/api/demand/hourly?station_id=2", { cookie: token })))).data;
      expect(hourly).toHaveLength(24);
      expect(hourly[11]).toMatchObject({ hour: 11, energyKwh: 22, sessions: 1 });
      const daily = (await body(await demandDaily(req("/api/demand/daily?from=2026-10-19&to=2026-10-21", { cookie: token })))).data;
      expect(daily.points.map((p: { energyKwh: number }) => p.energyKwh)).toEqual([0, 75, 0]);
    });
  });
});
