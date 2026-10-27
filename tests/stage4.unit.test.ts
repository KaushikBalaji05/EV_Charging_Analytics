import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

process.env.DATABASE_URL ??= "postgresql://unit:unit@localhost:5432/unit"; // never connected to in this file

import {
  DemandQuerySchema, OverloadQuerySchema, RankingQuerySchema, SessionQuerySchema, StationDetailQuerySchema,
  StationIdSchema, StationListQuerySchema, StationSeriesQuerySchema,
} from "@/lib/validation/listing";
import { describeIssues } from "@/lib/validation/params";
import { dir, likePattern, offsetFor, paged, rangeClause } from "@/lib/db/queries/shared";
import { computeTrend, type DailyDemandPoint } from "@/lib/db/queries/demand";
import { buildHref } from "@/lib/url";
import { formatDay, formatDuration, formatShortTimestamp } from "@/lib/format";

describe("station list schema", () => {
  it("applies safe defaults for an empty query", () => {
    expect(StationListQuerySchema.parse({})).toMatchObject({ sort: "energy", page: 1, pageSize: 20 });
  });
  it("treats blank form fields as absent", () => {
    const v = StationListQuerySchema.parse({ q: "", status: "", sort: "", order: "", page: "", page_size: "", from: "", to: "" });
    expect(v).toMatchObject({ sort: "energy", page: 1, pageSize: 20 });
    expect(v.search).toBeUndefined();
    expect(v.status).toBeUndefined();
  });
  it("coerces numeric strings", () => {
    expect(StationListQuerySchema.parse({ page: "3", page_size: "50" })).toMatchObject({ page: 3, pageSize: 50 });
  });
  it.each([
    ["unknown sort", { sort: "energy; DROP TABLE ev" }],
    ["sort not in allowlist", { sort: "password_hash" }],
    ["lower-case status", { status: "active" }],
    ["unknown status", { status: "BROKEN" }],
    ["bad order", { order: "sideways" }],
    ["page 0", { page: "0" }],
    ["negative page", { page: "-1" }],
    ["fractional page", { page: "1.5" }],
    ["page way out of range", { page: "99999" }],
    ["page_size over 100", { page_size: "101" }],
    ["page_size 0", { page_size: "0" }],
    ["non-numeric page", { page: "abc" }],
    ["search over 100 chars", { q: "x".repeat(101) }],
    ["from after to", { from: "2026-10-25", to: "2026-10-20" }],
    ["impossible date", { from: "2026-02-31" }],
    ["range over 366 days", { from: "2020-01-01", to: "2026-01-01" }],
  ])("rejects %s", (_n, input) => {
    expect(() => StationListQuerySchema.parse(input)).toThrow(ZodError);
  });
  it("keeps the search text but trims it", () => {
    expect(StationListQuerySchema.parse({ q: "  whitefield  " }).search).toBe("whitefield");
  });
});

describe("other endpoint schemas", () => {
  it("demand: optional station and range; rejects a bad station id", () => {
    expect(DemandQuerySchema.parse({})).toEqual({ from: undefined, to: undefined, stationId: undefined });
    expect(DemandQuerySchema.parse({ station_id: "2", from: "2026-10-01" })).toMatchObject({ stationId: 2, from: "2026-10-01" });
    for (const bad of ["0", "-3", "abc", "1.2", "99999999999"]) expect(() => DemandQuerySchema.parse({ station_id: bad })).toThrow(ZodError);
  });
  it("ranking: metric allowlist and limit bounds", () => {
    expect(RankingQuerySchema.parse({})).toMatchObject({ metric: "energy", limit: 10 });
    for (const m of ["energy", "sessions", "revenue", "utilization", "overloads"]) expect(RankingQuerySchema.parse({ metric: m }).metric).toBe(m);
    expect(() => RankingQuerySchema.parse({ metric: "cost" })).toThrow(ZodError);
    expect(() => RankingQuerySchema.parse({ limit: "51" })).toThrow(ZodError);
    expect(() => RankingQuerySchema.parse({ limit: "0" })).toThrow(ZodError);
  });
  it("overloads: sort allowlist and pagination", () => {
    expect(OverloadQuerySchema.parse({})).toMatchObject({ sort: "time", page: 1, pageSize: 20 });
    expect(OverloadQuerySchema.parse({ sort: "utilization", order: "asc" })).toMatchObject({ sort: "utilization", order: "asc" });
    expect(() => OverloadQuerySchema.parse({ sort: "station" })).toThrow(ZodError);
  });
  it("sessions: status, sort, ids and search", () => {
    expect(SessionQuerySchema.parse({})).toMatchObject({ status: "all", sort: "start", page: 1, pageSize: 20 });
    const v = SessionQuerySchema.parse({ station_id: "1", charger_id: "2", q: "KA01", status: "ongoing", sort: "duration" });
    expect(v).toMatchObject({ stationId: 1, chargerId: 2, search: "KA01", status: "ongoing", sort: "duration" });
    for (const bad of [{ status: "done" }, { sort: "end_time" }, { charger_id: "0" }, { station_id: "x" }]) {
      expect(() => SessionQuerySchema.parse(bad)).toThrow(ZodError);
    }
  });
  it("station detail and series queries", () => {
    expect(StationDetailQuerySchema.parse({ from: "2026-10-20" })).toEqual({ from: "2026-10-20", to: undefined });
    expect(StationSeriesQuerySchema.parse({})).toMatchObject({ limit: 200 });
    expect(() => StationSeriesQuerySchema.parse({ limit: "1001" })).toThrow(ZodError);
  });
  it("station id route segment", () => {
    expect(StationIdSchema.parse("12")).toBe(12);
    for (const bad of ["0", "-1", "abc", "1;DROP", "", "1.5"]) expect(() => StationIdSchema.parse(bad)).toThrow(ZodError);
  });
  it("describeIssues produces readable field messages", () => {
    const r = StationListQuerySchema.safeParse({ page: "0", sort: "bogus" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msgs = describeIssues(r.error);
      expect(msgs.some((m) => m.startsWith("page:"))).toBe(true);
      expect(msgs.some((m) => m.startsWith("sort:"))).toBe(true);
    }
  });
});

describe("SQL helpers", () => {
  it("likePattern wraps in % and escapes LIKE wildcards so they match literally", () => {
    expect(likePattern("nexon")).toBe("%nexon%");
    expect(likePattern("100%")).toBe("%100\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("a\\b")).toBe("%a\\\\b%");
  });
  it("likePattern returns null for blank or missing text", () => {
    expect(likePattern(undefined)).toBeNull();
    expect(likePattern("")).toBeNull();
    expect(likePattern("   ")).toBeNull();
  });
  it("rangeClause only ever references positional parameters", () => {
    const c = rangeClause("sd.start_time", 1, 2);
    expect(c).toContain("$1::date");
    expect(c).toContain("$2::date + 1");
    expect(c).not.toMatch(/'/);
  });
  it("paging arithmetic", () => {
    expect(offsetFor(1, 20)).toBe(0);
    expect(offsetFor(3, 20)).toBe(40);
    expect(paged([], 0, 1, 20).totalPages).toBe(1);
    expect(paged([1], 41, 1, 20).totalPages).toBe(3);
  });
  it("direction is one of two fixed keywords", () => {
    expect(dir("asc")).toBe("ASC");
    expect(dir("desc")).toBe("DESC");
  });
});

describe("demand trend", () => {
  const day = (date: string, kwh: number): DailyDemandPoint => ({ date, sessions: 1, energyKwh: kwh, revenue: 0, movingAvgKwh: 0 });
  it("needs at least two days", () => {
    expect(computeTrend([])).toBeNull();
    expect(computeTrend([day("2026-10-20", 5)])).toBeNull();
  });
  it("compares the latest window with the one before it", () => {
    const t = computeTrend([day("2026-10-19", 100), day("2026-10-20", 150)]);
    expect(t).toEqual({ windowDays: 1, recentKwh: 150, previousKwh: 100, changePct: 50 });
  });
  it("reports a drop as a negative change", () => {
    expect(computeTrend([day("2026-10-19", 75), day("2026-10-20", 0)])?.changePct).toBe(-100);
  });
  it("gives no percentage when the earlier window had no energy", () => {
    expect(computeTrend([day("2026-10-19", 0), day("2026-10-20", 40)])).toMatchObject({ previousKwh: 0, recentKwh: 40, changePct: null });
  });
  it("uses a 7-day window on longer series", () => {
    const pts = Array.from({ length: 20 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, "0")}`, i < 13 ? 10 : 20));
    expect(computeTrend(pts)).toMatchObject({ windowDays: 7, recentKwh: 140, previousKwh: 70, changePct: 100 });
  });
});

describe("URL and display helpers", () => {
  it("buildHref skips empty values and encodes the rest", () => {
    expect(buildHref("/stations", { q: "", page: 2, status: undefined, sort: null })).toBe("/stations?page=2");
    expect(buildHref("/stations", {})).toBe("/stations");
    expect(buildHref("/sessions", { q: "a b&c" })).toBe("/sessions?q=a+b%26c");
  });
  it("formatDuration", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1 h 0 min");
    expect(formatDuration(135)).toBe("2 h 15 min");
  });
  it("formatDay and formatShortTimestamp never shift the date", () => {
    expect(formatDay("2026-10-20")).toBe("20 Oct 2026");
    expect(formatDay(null)).toBe("—");
    expect(formatShortTimestamp("2026-10-20 09:05:00")).toBe("20 Oct 09:05");
  });
});
