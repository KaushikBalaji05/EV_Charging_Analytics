"use client";

import { useEffect, useState, useRef } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  LiveTelemetrySummary,
  LiveTelemetryTrendPoint,
} from "@/lib/types/data-admin";

export function LiveTelemetryMonitor() {
  const [latestList, setLatestList] = useState<LiveTelemetrySummary[]>([]);
  const [trendList, setTrendList] = useState<LiveTelemetryTrendPoint[]>([]);
  const [stationFilter, setStationFilter] = useState<string>("");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const inFlightRef = useRef(false);

  // Initial fetch and automatic polling interval
  useEffect(() => {
    isMountedRef.current = true;
    let active = true;

    const load = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        const params = new URLSearchParams();
        if (stationFilter) params.set("stationId", stationFilter);

        const res = await fetch(`/api/admin/data/telemetry/live?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to fetch live telemetry`);
        }
        const json = await res.json();
        if (active && isMountedRef.current) {
          setLatestList(json.data.latest || []);
          setTrendList(json.data.trend || []);
          setLastRefreshedAt(new Date());
          setError(null);
        }
      } catch (err) {
        if (active && isMountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        inFlightRef.current = false;
        if (active && isMountedRef.current) {
          setIsFetching(false);
        }
      }
    };

    void load();

    const intervalId = setInterval(() => {
      if (!isPaused && document.visibilityState !== "hidden") {
        void load();
      }
    }, 5000);

    return () => {
      active = false;
      isMountedRef.current = false;
      clearInterval(intervalId);
    };
  }, [stationFilter, isPaused]);

  const handleManualRefresh = async () => {
    setIsFetching(true);
    try {
      const params = new URLSearchParams();
      if (stationFilter) params.set("stationId", stationFilter);
      const res = await fetch(`/api/admin/data/telemetry/live?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLatestList(json.data.latest || []);
        setTrendList(json.data.trend || []);
        setLastRefreshedAt(new Date());
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule bg-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                !isPaused ? "bg-emerald-500 animate-ping" : "bg-amber-500"
              }`}
            />
            <span className="text-xs font-semibold text-ink">
              {!isPaused ? "Live Streaming (5s Polling)" : "Polling Paused"}
            </span>
          </div>

          <div>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink focus:border-charge focus:outline-none"
            >
              <option value="">All Stations</option>
              <option value="1">Station #1 (Central Charging Hub)</option>
              <option value="2">Station #2 (Tech Park Hub)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted">
            Last Refreshed: {lastRefreshedAt.toLocaleTimeString()}
          </span>

          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
              isPaused
                ? "border-emerald-600 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-rule bg-paper text-ink hover:bg-rule/40"
            }`}
          >
            {isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>

          <button
            type="button"
            onClick={() => handleManualRefresh()}
            disabled={isFetching}
            className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-rule/40 disabled:opacity-50"
          >
            {isFetching ? "🔄 Updating..." : "↻ Refresh Now"}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded border border-rose-300 bg-rose-500/10 p-3 text-xs text-rose-800">
          <strong>Telemetry Error:</strong> {error}
        </div>
      )}

      {/* Latest Per-Station Telemetry Cards */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-3">
          Latest Electrical Telemetry by Station (MongoDB)
        </h3>
        {latestList.length === 0 ? (
          <div className="rounded border border-rule bg-panel p-6 text-center text-xs text-muted">
            No active telemetry readings recorded in MongoDB yet.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {latestList.map((st) => (
              <div
                key={st.stationId}
                className={`rounded border p-4 shadow-sm transition ${
                  st.isOverloaded
                    ? "border-rose-400 bg-rose-500/5"
                    : "border-rule bg-panel"
                }`}
              >
                <div className="flex items-center justify-between border-b border-rule/60 pb-2.5">
                  <div>
                    <h4 className="font-semibold text-sm text-ink">{st.stationName}</h4>
                    <p className="text-[11px] text-muted font-mono">
                      Station #{st.stationId} · {new Date(st.recordedAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      st.isOverloaded
                        ? "bg-rose-500/20 text-rose-700 border border-rose-500/30"
                        : "bg-emerald-500/15 text-emerald-700"
                    }`}
                  >
                    {st.isOverloaded ? "OVERLOADED" : "NORMAL"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-paper/70 p-2">
                    <span className="text-[11px] text-muted block">EV Power Draw</span>
                    <span className="text-base font-bold text-charge">
                      {st.powerKw.toFixed(1)} kW
                    </span>
                    <span className="block text-[10px] text-muted">
                      of {st.capacityKw} kW capacity
                    </span>
                  </div>

                  <div className="rounded bg-paper/70 p-2">
                    <span className="text-[11px] text-muted block">Grid Feeder Load</span>
                    <span className="text-base font-bold text-ink">
                      {st.gridLoadKw.toFixed(1)} kW
                    </span>
                    <span className="block text-[10px] text-muted">
                      Feeder Transformer
                    </span>
                  </div>

                  <div className="rounded bg-paper/70 p-2">
                    <span className="text-[11px] text-muted block">Bus Voltage</span>
                    <span className="text-sm font-semibold text-ink">
                      {st.voltageV.toFixed(1)} V
                    </span>
                    <span className="block text-[10px] text-muted">
                      Current: {st.currentA.toFixed(1)} A
                    </span>
                  </div>

                  <div className="rounded bg-paper/70 p-2">
                    <span className="text-[11px] text-muted block">AC Frequency</span>
                    <span className="text-sm font-semibold text-ink">
                      {st.frequencyHz.toFixed(2)} Hz
                    </span>
                    <span className="block text-[10px] text-muted">
                      Source: {st.source}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real-time Telemetry Trend Chart */}
      {trendList.length > 0 && (
        <div className="rounded border border-rule bg-panel p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-rule pb-2 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Recent Telemetry Load Trends (Live Buffer)
              </h3>
              <p className="text-xs text-muted">
                Last {trendList.length} readings recorded in MongoDB
              </p>
            </div>
            <span className="font-mono text-[11px] text-muted">Unit: Kilowatts (kW)</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendList} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="recordedAt" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit=" kW" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderColor: "#e5e7eb",
                    borderRadius: "0.375rem",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="powerKw"
                  name="EV Charging Power"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="gridLoadKw"
                  name="Feeder Grid Load"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
