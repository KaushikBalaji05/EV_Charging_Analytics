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
  SimulatorInfo,
} from "@/lib/types/data-admin";
import { formatTime } from "@/lib/format";

interface LiveTelemetryMonitorProps {
  initialSimulator?: SimulatorInfo;
}

export function LiveTelemetryMonitor({ initialSimulator }: LiveTelemetryMonitorProps) {
  const [latestList, setLatestList] = useState<LiveTelemetrySummary[]>([]);
  const [trendList, setTrendList] = useState<LiveTelemetryTrendPoint[]>([]);
  const [stationFilter, setStationFilter] = useState<string>("");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isFetching, setIsFetching] = useState<boolean>(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [simulator, setSimulator] = useState<SimulatorInfo>(
    initialSimulator ?? {
      status: "stopped",
      pid: null,
      configuredIntervalMs: 5000,
      simulatedStations: [1, 2],
      latestTelemetryAt: null,
      recentLogs: [],
      exitReason: "Not started",
    }
  );
  const [showLogsDrawer, setShowLogsDrawer] = useState<boolean>(false);

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
          if (json.data.simulator) {
            setSimulator(json.data.simulator);
          }
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
        if (json.data.simulator) {
          setSimulator(json.data.simulator);
        }
        setLastRefreshedAt(new Date());
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFetching(false);
    }
  };

  // Determine freshness indicator based on latest telemetry timestamp
  const getFreshness = () => {
    if (!simulator.latestTelemetryAt) return { label: "No Stream", color: "bg-gray-500/15 text-muted" };
    const diffMs = lastRefreshedAt.getTime() - new Date(simulator.latestTelemetryAt).getTime();
    if (diffMs < 30000) return { label: "Real-time Stream", color: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" };
    if (diffMs < 120000) return { label: "Recent Stream", color: "bg-amber-500/15 text-amber-400 border border-amber-500/30" };
    return { label: "Stream Stale / Idle", color: "bg-gray-500/15 text-muted border border-rule" };
  };

  const freshness = getFreshness();

  // Filter cards based on selected filter
  const displayedStations = stationFilter
    ? latestList.filter((s) => String(s.stationId) === stationFilter)
    : latestList;

  const streamingCount = latestList.filter((s) => s.hasTelemetry).length;

  return (
    <div className="space-y-6">
      {/* Compact Simulator Diagnostics Panel */}
      <div className="rounded border border-rule bg-panel p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded bg-amber-500/10 text-sm font-semibold text-amber-500">
              ⚡
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">Telemetry Stream &amp; Simulator Engine</h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    simulator.status === "running"
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      : simulator.status === "crashed"
                      ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      : "bg-gray-500/15 text-muted border border-rule"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      simulator.status === "running"
                        ? "bg-emerald-400 animate-pulse"
                        : simulator.status === "crashed"
                        ? "bg-rose-400"
                        : "bg-gray-400"
                    }`}
                  />
                  {simulator.status === "running"
                    ? `Active Daemon (PID: ${simulator.pid})`
                    : simulator.status === "crashed"
                    ? "Process Interrupted"
                    : "Simulator Stopped"}
                </span>
                <span className={`inline-flex rounded px-2 py-0.5 text-[10px] font-medium ${freshness.color}`}>
                  {freshness.label}
                </span>
              </div>
              <p className="text-xs text-muted">
                High-frequency MongoDB document streaming ({streamingCount} of {latestList.length} stations streaming)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {simulator.exitReason && (
              <span className="text-[11px] text-muted font-mono hidden md:inline">
                {simulator.exitReason}
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowLogsDrawer((prev) => !prev)}
              className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-rule/40"
            >
              {showLogsDrawer ? "▲ Hide Logs" : "▼ Diagnostic Logs"}
            </button>
          </div>
        </div>

        {/* 4-Stat Strip */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div className="rounded border border-rule/60 bg-paper/50 p-2.5">
            <span className="text-muted block text-[11px]">Stream Cadence</span>
            <p className="mt-0.5 text-sm font-bold text-ink">
              {simulator.configuredIntervalMs / 1000}s per batch
            </p>
            <span className="text-[10px] text-muted">Configured generation tick</span>
          </div>

          <div className="rounded border border-rule/60 bg-paper/50 p-2.5">
            <span className="text-muted block text-[11px]">Simulated Stations</span>
            <p className="mt-0.5 text-sm font-bold text-ink">
              {simulator.simulatedStations.length} Stations Target
            </p>
            <span className="text-[10px] text-muted">
              Station #{simulator.simulatedStations.join(", #")}
            </span>
          </div>

          <div className="rounded border border-rule/60 bg-paper/50 p-2.5">
            <span className="text-muted block text-[11px]">Last MongoDB Write</span>
            <p className="mt-0.5 text-sm font-bold text-charge font-mono truncate" suppressHydrationWarning>
              {formatTime(simulator.latestTelemetryAt)}
            </p>
            <span className="text-[10px] text-muted">Verified in grid_telemetry</span>
          </div>

          <div className="rounded border border-rule/60 bg-paper/50 p-2.5">
            <span className="text-muted block text-[11px]">Load Profile</span>
            <p className="mt-0.5 text-sm font-bold text-emerald-400">Diurnal IST Curves</p>
            <span className="text-[10px] text-muted">Peak EV charging modeled</span>
          </div>
        </div>

        {/* Expandable Logs Drawer */}
        {showLogsDrawer && (
          <div className="mt-4 border-t border-rule/60 pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                Sanitized Simulator Logs (.simulator.log)
              </span>
              <span className="text-[10px] font-mono text-muted">ANSI &amp; Control Codes Stripped</span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded border border-rule bg-canvas p-3 font-mono text-xs text-ink/90 space-y-1">
              {simulator.recentLogs.length > 0 ? (
                simulator.recentLogs.map((log, idx) => (
                  <p key={idx} className="leading-relaxed">
                    {log}
                  </p>
                ))
              ) : (
                <p className="italic text-muted">
                  No log entries recorded. Start the simulator using &apos;npm run simulate:telemetry&apos;.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

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
              {!isPaused ? "Live Polling (5s Cadence)" : "Polling Paused"}
            </span>
          </div>

          <div>
            <select
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
              className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink focus:border-charge focus:outline-none"
            >
              <option value="">All Stations ({latestList.length})</option>
              {latestList.map((st) => (
                <option key={st.stationId} value={String(st.stationId)}>
                  Station #{st.stationId} — {st.stationName} {st.hasTelemetry ? "⚡ (Active)" : "⚪ (Idle)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted" suppressHydrationWarning>
            Last Refreshed: {formatTime(lastRefreshedAt)}
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

      {/* Per-Station Telemetry Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink">
            Station Electrical Telemetry &amp; Grid Ingestion
          </h3>
          <span className="text-xs text-muted font-mono">
            Displaying {displayedStations.length} of {latestList.length} stations
          </span>
        </div>

        {displayedStations.length === 0 ? (
          <div className="rounded border border-rule bg-panel p-6 text-center text-xs text-muted">
            No charging stations found in PostgreSQL matching the current filter.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
            {displayedStations.map((st) => (
              <div
                key={st.stationId}
                className={`rounded border p-4 shadow-sm transition ${
                  st.isOverloaded
                    ? "border-rose-400 bg-rose-500/5"
                    : st.hasTelemetry
                    ? "border-rule bg-panel"
                    : "border-rule/60 bg-panel/40 opacity-90"
                }`}
              >
                <div className="flex items-center justify-between border-b border-rule/60 pb-2.5">
                  <div>
                    <h4 className="font-semibold text-sm text-ink">{st.stationName}</h4>
                    <p className="text-[11px] text-muted font-mono" suppressHydrationWarning>
                      Station #{st.stationId} {st.recordedAt ? `· ${formatTime(st.recordedAt)}` : "· No stream"}
                    </p>
                  </div>
                  {st.hasTelemetry ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-bold ${
                        st.isOverloaded
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {st.isOverloaded ? "OVERLOADED" : "STREAMING"}
                    </span>
                  ) : (
                    <span className="rounded bg-gray-500/15 border border-rule px-2 py-0.5 text-xs font-medium text-muted">
                      No Telemetry Stream
                    </span>
                  )}
                </div>

                {st.hasTelemetry ? (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-paper/70 p-2">
                      <span className="text-[11px] text-muted block">EV Power Draw</span>
                      <span className="text-base font-bold text-charge">
                        {st.powerKw?.toFixed(1) ?? "—"} kW
                      </span>
                      <span className="block text-[10px] text-muted">
                        of {st.capacityKw} kW capacity
                      </span>
                    </div>

                    <div className="rounded bg-paper/70 p-2">
                      <span className="text-[11px] text-muted block">Grid Feeder Load</span>
                      <span className="text-base font-bold text-ink">
                        {st.gridLoadKw?.toFixed(1) ?? "—"} kW
                      </span>
                      <span className="block text-[10px] text-muted">
                        Feeder Transformer
                      </span>
                    </div>

                    <div className="rounded bg-paper/70 p-2">
                      <span className="text-[11px] text-muted block">Bus Voltage</span>
                      <span className="text-sm font-semibold text-ink">
                        {st.voltageV?.toFixed(1) ?? "—"} V
                      </span>
                      <span className="block text-[10px] text-muted">
                        Current: {st.currentA?.toFixed(1) ?? "—"} A
                      </span>
                    </div>

                    <div className="rounded bg-paper/70 p-2">
                      <span className="text-[11px] text-muted block">AC Frequency</span>
                      <span className="text-sm font-semibold text-ink">
                        {st.frequencyHz?.toFixed(2) ?? "—"} Hz
                      </span>
                      <span className="block text-[10px] text-muted">
                        Source: {st.source}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 rounded border border-dashed border-rule bg-paper/30 p-4 text-center">
                    <p className="text-xs font-medium text-ink">Awaiting Telemetry Stream</p>
                    <p className="mt-1 text-[11px] text-muted">
                      No active telemetry recorded in MongoDB for Station #{st.stationId}.
                    </p>
                    <div className="mt-2.5 inline-flex items-center gap-2 rounded bg-paper px-2.5 py-1 text-[11px] text-muted border border-rule">
                      <span>Rated Capacity: <strong>{st.capacityKw} kW</strong></span>
                      <span>·</span>
                      <span>PostgreSQL Registered</span>
                    </div>
                  </div>
                )}
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
                <CartesianGrid strokeDasharray="3 3" stroke="#2b3b55" />
                <XAxis dataKey="recordedAt" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#334155" />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#334155" unit=" kW" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0d1527",
                    borderColor: "#334155",
                    borderRadius: "0.375rem",
                    fontSize: "12px",
                    color: "#f1f5f9",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  type="monotone"
                  dataKey="powerKw"
                  name="EV Charging Power"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="gridLoadKw"
                  name="Feeder Grid Load"
                  stroke="#38bdf8"
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
