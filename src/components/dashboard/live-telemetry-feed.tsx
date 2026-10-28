"use client";

import { useEffect, useState, useCallback } from "react";
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
import type { TooltipContentProps } from "recharts";
import { formatKw, formatShortTimestamp, formatTimestamp } from "@/lib/format";

interface TelemetryPoint {
  recorded_at: string | Date;
  voltage_v: number;
  current_a: number;
  power_kw: number;
  frequency_hz: number;
  grid_load_kw: number;
  source: string;
  metadata?: {
    is_overloaded?: boolean;
    capacity_kw?: number;
    scenario?: string;
  };
}

interface LiveTelemetryData {
  latest: TelemetryPoint | null;
  history: TelemetryPoint[];
  stats: {
    avgVoltage: number | null;
    avgFrequency: number | null;
    avgPowerKw: number | null;
    maxPowerKw: number | null;
    avgGridLoadKw: number | null;
    maxGridLoadKw: number | null;
    sampleCount: number;
  };
}

function LiveTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as TelemetryPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-rule bg-panel px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatTimestamp(p.recorded_at.toString())}</p>
      <p className="text-charge">Power {formatKw(p.power_kw)}</p>
      <p className={p.metadata?.is_overloaded ? "font-semibold text-overload" : ""}>
        Grid load {formatKw(p.grid_load_kw)}{p.metadata?.is_overloaded ? " (OVERLOAD)" : ""}
      </p>
      <p className="text-muted">
        {p.voltage_v} V · {p.current_a} A · {p.frequency_hz.toFixed(3)} Hz
      </p>
      <p className="text-xs text-muted/80">Source: {p.source}</p>
    </div>
  );
}

export function LiveTelemetryFeed({
  stationId,
  refreshIntervalMs = 5000,
}: {
  stationId: number;
  refreshIntervalMs?: number;
}) {
  const [data, setData] = useState<LiveTelemetryData | null>(null);
  const [meta, setMeta] = useState<{ source?: string; timestamp?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch(`/api/stations/${stationId}/live-telemetry?limit=30`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status}`);
      }
      setData(json.data);
      setMeta({
        source: json.data?.source ?? "simulated",
        timestamp: json.meta?.generatedAt ?? new Date().toISOString(),
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load live telemetry");
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/stations/${stationId}/live-telemetry?limit=30`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          throw new Error(json.error?.message || `HTTP ${res.status}`);
        }
        setData(json.data);
        setMeta({
          source: json.data?.source ?? "simulated",
          timestamp: json.meta?.generatedAt ?? new Date().toISOString(),
        });
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load live telemetry");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    const promise = Promise.resolve().then(load);
    if (!autoRefresh) {
      return () => {
        cancelled = true;
        void promise;
      };
    }
    const timer = setInterval(() => { void load(); }, refreshIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
      void promise;
    };
  }, [stationId, autoRefresh, refreshIntervalMs]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 animate-pulse rounded bg-rule/70" />
          <div className="h-4 w-24 animate-pulse rounded bg-rule/70" />
        </div>
        <div className="h-64 animate-pulse rounded bg-rule/40" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded border border-overload/30 bg-overload-soft p-4 text-sm text-ink">
        <p className="font-medium text-overload">Unable to connect to MongoDB live telemetry</p>
        <p className="mt-1 text-muted">{error}</p>
        <button
          onClick={fetchTelemetry}
          className="mt-3 rounded border border-rule bg-panel px-3 py-1 text-xs font-medium hover:bg-paper"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const latest = data?.latest;
  const history = data?.history ?? [];
  const stats = data?.stats;
  const isOverloaded = latest?.metadata?.is_overloaded;

  return (
    <div className="space-y-4">
      {/* Control bar & Live status indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/60 pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {autoRefresh && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-charge opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2.5 w-2.5 rounded-full ${autoRefresh ? "bg-charge" : "bg-muted"}`}
            />
          </span>
          <span className="text-xs font-semibold tracking-wide uppercase text-ink">
            {autoRefresh ? "Live Stream (Simulated)" : "Stream Paused"}
          </span>
          <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
            Source: {meta?.source ?? "simulated"}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted">
          {meta?.timestamp && (
            <span>Updated {formatShortTimestamp(meta.timestamp)}</span>
          )}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className="rounded border border-rule bg-panel px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-paper"
          >
            {autoRefresh ? "Pause" : "Resume"}
          </button>
          <button
            type="button"
            onClick={fetchTelemetry}
            className="rounded border border-rule bg-panel px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-paper"
          >
            Refresh
          </button>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm font-medium">No live telemetry readings recorded yet</p>
          <p className="mt-1 max-w-sm text-xs text-muted">
            Start the telemetry generator to stream live measurements into MongoDB:
          </p>
          <code className="mt-2 rounded bg-paper px-2 py-1 text-xs text-ink">
            npm run simulator:start
          </code>
        </div>
      ) : (
        <>
          {/* Key Instantaneous Telemetry Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded border border-rule bg-paper/60 p-3">
              <span className="text-xs text-muted">Instant Power</span>
              <p className="text-lg font-semibold text-ink">{latest ? formatKw(latest.power_kw) : "—"}</p>
              <span className="text-[11px] text-muted">Charging draw</span>
            </div>
            <div className={`rounded border p-3 ${isOverloaded ? "border-overload bg-overload-soft" : "border-rule bg-paper/60"}`}>
              <span className="text-xs text-muted">Transformer Load</span>
              <p className={`text-lg font-semibold ${isOverloaded ? "text-overload" : "text-ink"}`}>
                {latest ? formatKw(latest.grid_load_kw) : "—"}
              </p>
              <span className="text-[11px] text-muted">
                {isOverloaded ? "⚠️ OVERLOADED" : "Normal capacity"}
              </span>
            </div>
            <div className="rounded border border-rule bg-paper/60 p-3">
              <span className="text-xs text-muted">Bus Voltage</span>
              <p className="text-lg font-semibold text-ink">{latest ? `${latest.voltage_v} V` : "—"}</p>
              <span className="text-[11px] text-muted">{latest ? `${latest.current_a} A phase` : "Three-phase"}</span>
            </div>
            <div className="rounded border border-rule bg-paper/60 p-3">
              <span className="text-xs text-muted">Grid Frequency</span>
              <p className="text-lg font-semibold text-ink">
                {latest ? `${latest.frequency_hz.toFixed(3)} Hz` : "—"}
              </p>
              <span className="text-[11px] text-muted">Target 50.00 Hz</span>
            </div>
          </div>

          {/* Real-time Telemetry Trend Line Chart */}
          <div className="h-64 w-full" role="img" aria-label="Live grid telemetry trend chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke="#d5dedb" />
                <XAxis
                  dataKey="recorded_at"
                  tickFormatter={(val) => formatShortTimestamp(val.toString())}
                  tick={{ fontSize: 11 }}
                  stroke="#55666e"
                  minTickGap={28}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#55666e"
                  width={44}
                  label={{
                    value: "kW",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 11,
                    fill: "#55666e",
                  }}
                />
                <Tooltip content={LiveTooltip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                  dataKey="grid_load_kw"
                  name="Grid load (kW)"
                  stroke="#b83a0c"
                  strokeWidth={2}
                  dot={history.length < 25}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="power_kw"
                  name="EV Power (kW)"
                  stroke="#0b7a6b"
                  strokeWidth={2}
                  dot={history.length < 25}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* MongoDB Aggregation Pipeline Summary Footer */}
          {stats && stats.sampleCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule/80 bg-paper/40 px-3 py-2 text-xs text-muted">
              <span>
                <strong>MongoDB Aggregated Stats:</strong> Window of {stats.sampleCount} samples
              </span>
              <div className="flex gap-4">
                <span>Avg Power: <strong>{formatKw(stats.avgPowerKw)}</strong></span>
                <span>Max Load: <strong>{formatKw(stats.maxGridLoadKw)}</strong></span>
                <span>Avg Voltage: <strong>{stats.avgVoltage} V</strong></span>
                <span>Avg Freq: <strong>{stats.avgFrequency} Hz</strong></span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
