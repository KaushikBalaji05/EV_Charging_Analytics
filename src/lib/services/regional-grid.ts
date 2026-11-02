import "server-only";

export interface RegionalGridContext {
  source: "central_electricity_authority";
  timestamp: string;
  karnatakaPeakDemandMw: number;
  karnatakaPeakMetMw: number;
  nationalDemandMetMw: number;
  reportingPeriod: string;
  disclaimer: string;
  attribution: string;
  dataQuality?: "live" | "partial" | "benchmark";
  isNationalLive?: boolean;
  isStateLive?: boolean;
}

export const CEA_FALLBACK: RegionalGridContext = {
  source: "central_electricity_authority",
  timestamp: new Date().toISOString(),
  karnatakaPeakDemandMw: 16894,
  karnatakaPeakMetMw: 16894,
  nationalDemandMetMw: 185420,
  reportingPeriod: "August 2026 (Verified Benchmark)",
  disclaimer:
    "Regional/National bulk grid measurements in Megawatts (MW) from Central Electricity Authority. Contextual macro-grid benchmark only; strictly separate from station-level EV load.",
  attribution: "Ministry of Power / Central Electricity Authority (India) Open Data",
  dataQuality: "benchmark",
  isNationalLive: false,
  isStateLive: false,
};

const CEA_TIMEOUT_MS = 2500;

interface CachedEntry<T> {
  data: T;
  timestamp: number;
}

let lastKnownNational: CachedEntry<number> | null = null;
let lastKnownState: CachedEntry<{
  peakMw: number;
  metMw: number;
  monthLabel: string;
}> | null = null;

/** Helper for test suites to clear in-memory cache between test cases */
export function _resetRegionalGridCacheForTesting(): void {
  lastKnownNational = null;
  lastKnownState = null;
}

function formatErrorReason(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError" || err.message.toLowerCase().includes("timeout")) {
      return `request timed out (${CEA_TIMEOUT_MS}ms)`;
    }
    return err.message;
  }
  return String(err);
}

/**
 * Fetches national demand met from CEA Merit-India endpoint.
 * Bounded timeout, structured logging, and fallback preservation.
 */
async function fetchNationalDemand(): Promise<{ mw: number; isLive: boolean; fromCache?: boolean }> {
  const dateStr = new Date().toISOString().substring(0, 10);
  const url = `https://cea.nic.in/api/merit-india/demand-met?date=${dateStr}`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 }, // 5 min cache
      signal: AbortSignal.timeout(CEA_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[cea-api] National demand endpoint returned HTTP ${res.status}`);
      return fallbackNational();
    }

    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const latestPoint = data[data.length - 1];
      if (latestPoint && typeof latestPoint.valueOfData === "number" && latestPoint.valueOfData > 0) {
        lastKnownNational = {
          data: latestPoint.valueOfData,
          timestamp: Date.now(),
        };
        return { mw: latestPoint.valueOfData, isLive: true };
      }
    }

    console.warn(`[cea-api] National demand endpoint returned unexpected payload format`);
    return fallbackNational();
  } catch (err: unknown) {
    console.warn(`[cea-api] National demand endpoint failed: ${formatErrorReason(err)}`);
    return fallbackNational();
  }
}

function fallbackNational(): { mw: number; isLive: boolean; fromCache?: boolean } {
  if (lastKnownNational) {
    return { mw: lastKnownNational.data, isLive: false, fromCache: true };
  }
  return { mw: CEA_FALLBACK.nationalDemandMetMw, isLive: false };
}

/**
 * Fetches state peak demand from CEA Dashboard endpoint.
 * Bounded timeout, structured logging, and fallback preservation.
 */
async function fetchStatePeakDemand(): Promise<{
  peakMw: number;
  metMw: number;
  monthLabel: string;
  isLive: boolean;
  fromCache?: boolean;
}> {
  const url = "https://cea.nic.in/api/dashboard/peak-demand";
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 }, // 1 hour cache
      signal: AbortSignal.timeout(CEA_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[cea-api] State peak demand endpoint returned HTTP ${res.status}`);
      return fallbackState();
    }

    const peakData = await res.json();
    const idx = peakData?.categories?.indexOf("Karnataka");
    if (
      idx !== undefined &&
      idx >= 0 &&
      Array.isArray(peakData?.series1Data) &&
      Array.isArray(peakData?.series2Data)
    ) {
      const peakMw = peakData.series1Data[idx];
      const metMw = peakData.series2Data[idx];
      if (typeof peakMw === "number" && typeof metMw === "number" && peakMw > 0 && metMw > 0) {
        const monthLabel = `${peakData.month ?? "Recent"} (State PSP)`;
        lastKnownState = {
          data: { peakMw, metMw, monthLabel },
          timestamp: Date.now(),
        };
        return { peakMw, metMw, monthLabel, isLive: true };
      }
    }

    console.warn(`[cea-api] State peak demand payload missing Karnataka data or invalid structure`);
    return fallbackState();
  } catch (err: unknown) {
    console.warn(`[cea-api] State peak demand endpoint failed: ${formatErrorReason(err)}`);
    return fallbackState();
  }
}

function fallbackState(): {
  peakMw: number;
  metMw: number;
  monthLabel: string;
  isLive: boolean;
  fromCache?: boolean;
} {
  if (lastKnownState) {
    return {
      peakMw: lastKnownState.data.peakMw,
      metMw: lastKnownState.data.metMw,
      monthLabel: `${lastKnownState.data.monthLabel} (Cached)`,
      isLive: false,
      fromCache: true,
    };
  }
  return {
    peakMw: CEA_FALLBACK.karnatakaPeakDemandMw,
    metMw: CEA_FALLBACK.karnatakaPeakMetMw,
    monthLabel: CEA_FALLBACK.reportingPeriod,
    isLive: false,
  };
}

/**
 * Fetches regional grid context from Central Electricity Authority (India).
 * Concurrently queries public CEA endpoints with bounded timeouts.
 * If one or both endpoints fail/timeout, preserves valid data from the other
 * and falls back gracefully to verified benchmark figures without failing the caller.
 */
export async function getRegionalGridContext(): Promise<RegionalGridContext> {
  // Execute independent CEA requests concurrently
  const [nationalRes, stateRes] = await Promise.allSettled([
    fetchNationalDemand(),
    fetchStatePeakDemand(),
  ]);

  const national =
    nationalRes.status === "fulfilled"
      ? nationalRes.value
      : fallbackNational();

  const state =
    stateRes.status === "fulfilled"
      ? stateRes.value
      : fallbackState();

  let dataQuality: "live" | "partial" | "benchmark";
  let reportingPeriod: string;

  if (national.isLive && state.isLive) {
    dataQuality = "live";
    reportingPeriod = `${state.monthLabel} · Merit-India Live Feed`;
  } else if (national.isLive && !state.isLive) {
    dataQuality = "partial";
    reportingPeriod = `Merit-India Live · Karnataka Benchmark (${state.monthLabel})`;
  } else if (!national.isLive && state.isLive) {
    dataQuality = "partial";
    reportingPeriod = `${state.monthLabel} · National Benchmark (185.4 GW)`;
  } else {
    dataQuality = "benchmark";
    reportingPeriod = state.fromCache || national.fromCache
      ? "Last Known Good CEA Reading (Historical Cache)"
      : CEA_FALLBACK.reportingPeriod;
  }

  return {
    source: "central_electricity_authority",
    timestamp: new Date().toISOString(),
    karnatakaPeakDemandMw: state.peakMw,
    karnatakaPeakMetMw: state.metMw,
    nationalDemandMetMw: national.mw,
    reportingPeriod,
    disclaimer: CEA_FALLBACK.disclaimer,
    attribution: CEA_FALLBACK.attribution,
    dataQuality,
    isNationalLive: national.isLive,
    isStateLive: state.isLive,
  };
}
