import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { OverviewQuerySchema } from "@/lib/validation/overview";
import { optionalStationId } from "@/lib/validation/common";
import { ApiError, toPublicError } from "@/lib/api/errors";

describe("date range validation", () => {
  it("accepts an empty filter (all time)", () => {
    expect(OverviewQuerySchema.parse({})).toEqual({});
  });
  it("treats blank form fields as no filter", () => {
    expect(OverviewQuerySchema.parse({ from: "", to: "" })).toEqual({});
  });
  it("accepts a valid inclusive range, including a single day", () => {
    expect(OverviewQuerySchema.parse({ from: "2026-10-20", to: "2026-10-20" })).toEqual({ from: "2026-10-20", to: "2026-10-20" });
  });
  it.each([
    ["wrong format", { from: "20-10-2026" }],
    ["impossible date", { from: "2026-02-31" }],
    ["from after to", { from: "2026-10-25", to: "2026-10-20" }],
    ["range over 366 days", { from: "2020-01-01", to: "2026-01-01" }],
    ["SQL fragment", { from: "2026-10-20';DROP TABLE ev;--" }],
  ])("rejects %s", (_name, input) => {
    expect(() => OverviewQuerySchema.parse(input)).toThrow(ZodError);
  });
  it("reports one message per bad field, not duplicates", () => {
    const r = OverviewQuerySchema.safeParse({ from: "20-10-2026" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues).toHaveLength(1);
  });
});

describe("id validation", () => {
  it("coerces numeric strings", () => expect(optionalStationId.parse("3")).toBe(3));
  it("treats blank as absent", () => expect(optionalStationId.parse("")).toBeUndefined());
  it.each(["0", "-1", "1.5", "abc", "99999999999"])("rejects %s", (v) => {
    expect(() => optionalStationId.parse(v)).toThrow(ZodError);
  });
});

describe("error sanitising", () => {
  it("maps validation errors to 400 with field details", () => {
    const err = (() => { try { OverviewQuerySchema.parse({ from: "x" }); } catch (e) { return e; } })();
    const p = toPublicError(err);
    expect(p.status).toBe(400);
    expect(p.details?.[0].field).toBe("from");
  });
  it("maps connection failures to a generic 503", () => {
    const p = toPublicError(Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432"), { code: "ECONNREFUSED" }));
    expect(p.status).toBe(503);
    expect(JSON.stringify(p)).not.toContain("10.0.0.5");
  });
  it("maps MongoDB unavailability errors to 503 without leaking connection info", () => {
    const mongoErr = Object.assign(
      new Error("Server selection timed out after 5000 ms at mongodb://db-admin:secret@127.0.0.1:27017"),
      { name: "MongoServerSelectionError" },
    );
    const p = toPublicError(mongoErr);
    expect(p.status).toBe(503);
    expect(p.code).toBe("DATABASE_UNAVAILABLE");
    expect(JSON.stringify(p)).not.toMatch(/mongodb|secret|127\.0\.0\.1|27017/i);

    const netErr = Object.assign(
      new Error("connect ECONNREFUSED 127.0.0.1:27017"),
      { name: "MongoNetworkError", cause: { code: "ECONNREFUSED" } },
    );
    const pNet = toPublicError(netErr);
    expect(pNet.status).toBe(503);
    expect(pNet.code).toBe("DATABASE_UNAVAILABLE");
  });
  it("keeps unexpected programming errors as HTTP 500", () => {
    const typeErr = new TypeError("Cannot read properties of undefined (reading 'station_id')");
    const p = toPublicError(typeErr);
    expect(p.status).toBe(500);
    expect(p.code).toBe("INTERNAL_ERROR");
  });
  it("never leaks SQL or internals from unknown errors", () => {
    const p = toPublicError(new Error('relation "secret_table" does not exist at SELECT * FROM secret_table'));
    expect(p.status).toBe(500);
    expect(JSON.stringify(p)).not.toMatch(/secret_table|SELECT/);
  });
  it("passes through deliberate ApiErrors", () => {
    expect(toPublicError(new ApiError(404, "NOT_FOUND", "Station not found"))).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
