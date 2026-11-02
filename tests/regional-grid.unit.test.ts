import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CEA_FALLBACK,
  getRegionalGridContext,
  _resetRegionalGridCacheForTesting,
} from "../src/lib/services/regional-grid";

describe("CEA Regional Grid Service & Fault Tolerance", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    _resetRegionalGridCacheForTesting();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _resetRegionalGridCacheForTesting();
  });

  const mockNationalPayload = [{ valueOfData: 198450 }];
  const mockStatePayload = {
    month: "September 2026",
    categories: ["Tamil Nadu", "Karnataka", "Maharashtra"],
    series1Data: [18000, 17250, 24000],
    series2Data: [18000, 17200, 24000],
  };

  it("Scenario 1: Both CEA endpoints respond successfully", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("merit-india/demand-met")) {
        return new Response(JSON.stringify(mockNationalPayload), { status: 200 });
      }
      if (urlStr.includes("dashboard/peak-demand")) {
        return new Response(JSON.stringify(mockStatePayload), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const res = await getRegionalGridContext();

    expect(res.source).toBe("central_electricity_authority");
    expect(res.nationalDemandMetMw).toBe(198450);
    expect(res.karnatakaPeakDemandMw).toBe(17250);
    expect(res.karnatakaPeakMetMw).toBe(17200);
    expect(res.dataQuality).toBe("live");
    expect(res.isNationalLive).toBe(true);
    expect(res.isStateLive).toBe(true);
    expect(res.reportingPeriod).toContain("Live Feed");
  });

  it("Scenario 2: National endpoint times out, state endpoint succeeds", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("merit-india/demand-met")) {
        const timeoutErr = new Error("The operation was aborted due to timeout");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      }
      if (urlStr.includes("dashboard/peak-demand")) {
        return new Response(JSON.stringify(mockStatePayload), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const res = await getRegionalGridContext();

    // Valid state data preserved
    expect(res.karnatakaPeakDemandMw).toBe(17250);
    expect(res.karnatakaPeakMetMw).toBe(17200);
    // National falls back to verified benchmark
    expect(res.nationalDemandMetMw).toBe(CEA_FALLBACK.nationalDemandMetMw);
    expect(res.dataQuality).toBe("partial");
    expect(res.isNationalLive).toBe(false);
    expect(res.isStateLive).toBe(true);
    expect(res.reportingPeriod).toContain("National Benchmark");
  });

  it("Scenario 3: State endpoint times out, national endpoint succeeds", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("merit-india/demand-met")) {
        return new Response(JSON.stringify(mockNationalPayload), { status: 200 });
      }
      if (urlStr.includes("dashboard/peak-demand")) {
        const timeoutErr = new Error("The operation was aborted due to timeout");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      }
      return new Response("Not found", { status: 404 });
    });

    const res = await getRegionalGridContext();

    // Valid national data preserved
    expect(res.nationalDemandMetMw).toBe(198450);
    // State falls back to verified benchmark
    expect(res.karnatakaPeakDemandMw).toBe(CEA_FALLBACK.karnatakaPeakDemandMw);
    expect(res.karnatakaPeakMetMw).toBe(CEA_FALLBACK.karnatakaPeakMetMw);
    expect(res.dataQuality).toBe("partial");
    expect(res.isNationalLive).toBe(true);
    expect(res.isStateLive).toBe(false);
    expect(res.reportingPeriod).toContain("Merit-India Live");
  });

  it("Scenario 4: Both endpoints time out", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const timeoutErr = new Error("The operation was aborted due to timeout");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    });

    const res = await getRegionalGridContext();

    expect(res.source).toBe("central_electricity_authority");
    expect(res.nationalDemandMetMw).toBe(CEA_FALLBACK.nationalDemandMetMw);
    expect(res.karnatakaPeakDemandMw).toBe(CEA_FALLBACK.karnatakaPeakDemandMw);
    expect(res.karnatakaPeakMetMw).toBe(CEA_FALLBACK.karnatakaPeakMetMw);
    expect(res.dataQuality).toBe("benchmark");
    expect(res.isNationalLive).toBe(false);
    expect(res.isStateLive).toBe(false);
  });

  it("Scenario 5: One endpoint returns an invalid response (malformed payload)", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("merit-india/demand-met")) {
        // Empty array or invalid JSON structure
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (urlStr.includes("dashboard/peak-demand")) {
        return new Response(JSON.stringify(mockStatePayload), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const res = await getRegionalGridContext();

    expect(res.karnatakaPeakDemandMw).toBe(17250);
    expect(res.nationalDemandMetMw).toBe(CEA_FALLBACK.nationalDemandMetMw);
    expect(res.dataQuality).toBe("partial");
    expect(res.isNationalLive).toBe(false);
    expect(res.isStateLive).toBe(true);
  });

  it("Scenario 6: Both endpoints return invalid responses (HTTP errors)", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response("Internal Server Error", { status: 500 });
    });

    const res = await getRegionalGridContext();

    expect(res.source).toBe("central_electricity_authority");
    expect(res.nationalDemandMetMw).toBe(CEA_FALLBACK.nationalDemandMetMw);
    expect(res.karnatakaPeakDemandMw).toBe(CEA_FALLBACK.karnatakaPeakDemandMw);
    expect(res.dataQuality).toBe("benchmark");
    expect(res.isNationalLive).toBe(false);
    expect(res.isStateLive).toBe(false);
  });

  it("Scenario 7: Last-known-good cache preserves recent live reading when upstream subsequently fails", async () => {
    // 1. Initial successful fetch
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL) => {
      const urlStr = String(url);
      if (urlStr.includes("merit-india/demand-met")) {
        return new Response(JSON.stringify([{ valueOfData: 201000 }]), { status: 200 });
      }
      if (urlStr.includes("dashboard/peak-demand")) {
        return new Response(JSON.stringify(mockStatePayload), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    });

    const initial = await getRegionalGridContext();
    expect(initial.nationalDemandMetMw).toBe(201000);
    expect(initial.isNationalLive).toBe(true);

    // 2. Subsequent call times out
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      const timeoutErr = new Error("Connection timed out");
      timeoutErr.name = "TimeoutError";
      throw timeoutErr;
    });

    const cached = await getRegionalGridContext();
    // Preserves the 201,000 MW reading from last-known-good cache instead of resetting to raw benchmark
    expect(cached.nationalDemandMetMw).toBe(201000);
    expect(cached.karnatakaPeakDemandMw).toBe(17250);
    expect(cached.dataQuality).toBe("benchmark");
    expect(cached.reportingPeriod).toContain("Last Known Good");
  });
});
