"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

interface ExternalConnector {
  type: string;
  ratedPowerKw: number;
  currentType: "AC" | "DC";
  status: "AVAILABLE" | "OCCUPIED" | "UNKNOWN";
  rawFieldSource?: string;
}

interface ExternalStationMetadata {
  localStationId: number;
  externalSource: "open_charge_map_curated" | "open_charge_map_live" | "bescom_public_registry";
  externalId: string;
  stationName: string;
  operatorName: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
  city: string;
  state: string;
  country: string;
  totalRatedCapacityKw: number;
  connectors: ExternalConnector[];
  retrievalMethod: "curated_public_record" | "live_api_fetch";
  provenanceUrl: string;
  verifiedFields: string[];
  attribution: string;
  notes?: string;
}

interface TelemetryPoint {
  recorded_at: string | Date;
  voltage_v: number;
  current_a: number;
  power_kw: number;
  frequency_hz: number;
  grid_load_kw: number;
  source: "simulated";
  metadata?: {
    is_overloaded?: boolean;
    capacity_kw?: number;
    scenario?: string;
  };
}

interface RegionalGridContext {
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

export type TelemetryFreshnessStatus = "live" | "stale" | "missing" | "unavailable";

interface HybridSummaryData {
  localStationId: number;
  externalMetadata: ExternalStationMetadata | null;
  liveTelemetry: {
    status: TelemetryFreshnessStatus;
    isLive: boolean;
    ageSeconds: number | null;
    error?: string;
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
  };
  regionalGrid: RegionalGridContext | null;
  sourceSummary: {
    metadataSource: string;
    telemetrySource: string;
    telemetryStatus?: TelemetryFreshnessStatus;
    gridContextSource: string;
  };
}

function formatAge(seconds: number | null): string {
  if (seconds === null) return "";
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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
      <p className="text-xs text-muted/80">Source: {p.source} (MongoDB)</p>
    </div>
  );
}

export function HybridStationView({
  stationId,
  refreshIntervalMs = 5000,
}: {
  stationId: number;
  refreshIntervalMs?: number;
}) {
  const [data, setData] = useState<HybridSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  const fetchSummary = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/stations/${stationId}/hybrid-summary?limit=30`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status}`);
      }
      setData(json.data);
      setError(null);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load hybrid summary");
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    abortRef.current = controller;

    const load = async () => {
      try {
        const res = await fetch(`/api/stations/${stationId}/hybrid-summary?limit=30`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json.ok) {
          throw new Error(json.error?.message || `HTTP ${res.status}`);
        }
        setData(json.data);
        setError(null);
      } catch (err) {
        if (!active || (err instanceof Error && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Failed to load hybrid summary");
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();

    if (!autoRefresh) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    const timer = setInterval(() => {
      void load();
    }, refreshIntervalMs);

    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [stationId, autoRefresh, refreshIntervalMs]);

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded border border-rule bg-rule/20" />
        <div className="h-64 animate-pulse rounded border border-rule bg-rule/20" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded border border-overload/30 bg-overload-soft p-4 text-sm text-ink">
        <p className="font-medium text-overload">Unable to load hybrid station summary</p>
        <p className="mt-1 text-muted">{error}</p>
        <button
          onClick={fetchSummary}
          className="mt-3 rounded border border-rule bg-panel px-3 py-1 text-xs font-medium hover:bg-paper"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const ocm = data?.externalMetadata;
  const live = data?.liveTelemetry;
  const latest = live?.latest;
  const history = live?.history ?? [];
  const stats = live?.stats;
  const cea = data?.regionalGrid;
  const isOverloaded = latest?.metadata?.is_overloaded;

  const telemetryStatus: TelemetryFreshnessStatus =
    live?.status ?? (history.length > 0 ? "stale" : "missing");
  const isLiveStreaming = telemetryStatus === "live";
  const ageLabel = formatAge(live?.ageSeconds ?? null);

  return (
    <div className="space-y-6">
      {/* CARD 1: Real External Station Metadata (Open Charge Map) */}
      <div className="rounded border border-rule bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/70 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded bg-[#1d4f91]/10 px-2.5 py-0.5 text-xs font-semibold text-[#1d4f91]">
              {ocm?.retrievalMethod === "live_api_fetch"
                ? "External metadata: Open Charge Map (Live API)"
                : "External metadata: Open Charge Map (Curated Public Export)"}
            </span>
            <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted font-mono">
              Ref ID: {ocm?.externalId} (Local DB ID #{stationId})
            </span>
            {ocm?.provenanceUrl && (
              <a
                href={ocm.provenanceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-charge underline hover:text-charge/80"
              >
                Inspect Raw Export JSON ↗
              </a>
            )}
          </div>
          <span className="text-xs text-muted">
            {ocm?.attribution}
          </span>
        </div>

        {ocm ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <span className="text-xs text-muted">Verified Station Name</span>
              <p className="font-medium text-ink">{ocm.stationName}</p>
              <p className="text-xs text-muted">{ocm.formattedAddress}</p>
            </div>
            <div>
              <span className="text-xs text-muted">Network Operator</span>
              <p className="font-medium text-ink">{ocm.operatorName}</p>
              <div className="mt-1 flex items-center gap-2 text-xs">
                <span className="text-muted">GPS:</span>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${ocm.latitude}&mlon=${ocm.longitude}#map=16/${ocm.latitude}/${ocm.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-charge underline hover:text-charge/80"
                >
                  {ocm.latitude.toFixed(4)}° N, {ocm.longitude.toFixed(4)}° E ↗
                </a>
              </div>
            </div>
            <div>
              <span className="text-xs text-muted">Installed Physical Chargers (Verified OCM)</span>
              <ul className="mt-1 space-y-1">
                {ocm.connectors.map((c, i) => (
                  <li key={i} className="flex flex-col rounded bg-paper/70 px-2 py-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{c.type}</span>
                      <span className="font-mono text-muted">{c.ratedPowerKw} kW ({c.currentType})</span>
                    </div>
                    {c.rawFieldSource && (
                      <span className="text-[10px] text-muted/80">{c.rawFieldSource}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted">No external metadata mapping found for station #{stationId}.</p>
        )}
      </div>

      {/* CARD 2: Simulated Live / Stale Electrical Telemetry (MongoDB) */}
      <div className="rounded border border-rule bg-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/70 pb-3">
          <div className="flex items-center gap-2">
            {/* Live streaming status indicator */}
            {isLiveStreaming ? (
              <span className="relative flex h-2.5 w-2.5">
                {autoRefresh && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-charge opacity-75" />
                )}
                <span
                  className={`relative inline-flex h-2.5 w-2.5 rounded-full ${autoRefresh ? "bg-charge" : "bg-muted"}`}
                />
              </span>
            ) : (
              <span
                className={`inline-flex h-2.5 w-2.5 rounded-full ${
                  telemetryStatus === "stale"
                    ? "bg-amber-500"
                    : telemetryStatus === "unavailable"
                      ? "bg-overload"
                      : "bg-muted"
                }`}
              />
            )}

            {telemetryStatus === "live" && (
              <span className="inline-flex items-center rounded bg-charge/10 px-2.5 py-0.5 text-xs font-semibold text-charge">
                Live electrical telemetry: Active stream {ageLabel ? `(${ageLabel})` : ""}
              </span>
            )}
            {telemetryStatus === "stale" && (
              <span className="inline-flex items-center rounded bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                Stored telemetry: Stale reading {ageLabel ? `(${ageLabel})` : ""}
              </span>
            )}
            {telemetryStatus === "missing" && (
              <span className="inline-flex items-center rounded bg-muted/10 px-2.5 py-0.5 text-xs font-semibold text-muted">
                Telemetry: No readings recorded
              </span>
            )}
            {telemetryStatus === "unavailable" && (
              <span className="inline-flex items-center rounded bg-overload/10 px-2.5 py-0.5 text-xs font-semibold text-overload">
                Telemetry: Source unavailable
              </span>
            )}

            <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">
              MongoDB: grid_telemetry
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted">
            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="rounded border border-rule bg-panel px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-paper"
            >
              {autoRefresh ? "Pause Stream" : "Resume Stream"}
            </button>
            <button
              type="button"
              onClick={fetchSummary}
              className="rounded border border-rule bg-panel px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-paper"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Unavailable state notice */}
        {telemetryStatus === "unavailable" && (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-xs text-ink">
            <p className="font-semibold text-amber-800">Telemetry Database Temporarily Unreachable</p>
            <p className="mt-1 text-muted">
              {live?.error || "Unable to reach MongoDB grid_telemetry."} PostgreSQL relational billing analytics and Open Charge Map hardware specifications remain active.
            </p>
          </div>
        )}

        {/* Stale data warning indicator */}
        {telemetryStatus === "stale" && history.length > 0 && (
          <div className="mt-3 flex items-center justify-between rounded border border-amber-200 bg-amber-50/60 px-3 py-1.5 text-xs text-amber-800">
            <span>
              ⚠️ Telemetry simulator is stopped or paused. Showing previous readings from {ageLabel}.
            </span>
            <code className="text-[11px] font-mono text-muted">npm run simulator:start</code>
          </div>
        )}

        {/* Empty state */}
        {history.length === 0 && telemetryStatus !== "unavailable" ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm font-medium">No live telemetry readings recorded yet in MongoDB</p>
            <p className="mt-1 max-w-sm text-xs text-muted">
              Start the simulator daemon to stream simulated electrical measurements:
            </p>
            <code className="mt-2 rounded bg-paper px-2 py-1 text-xs text-ink">
              npm run simulator:start
            </code>
          </div>
        ) : history.length > 0 ? (
          <div className="mt-4 space-y-4">
            {/* Live Electrical Strips */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded border border-rule bg-paper/60 p-3">
                <span className="text-xs text-muted">EV Charging Power</span>
                <p className="text-lg font-semibold text-ink">{latest ? formatKw(latest.power_kw) : "—"}</p>
                <span className="text-[11px] text-muted">
                  {isLiveStreaming ? "Instant draw" : `Draw at ${latest ? formatShortTimestamp(latest.recorded_at.toString()) : ""}`}
                </span>
              </div>
              <div className={`rounded border p-3 ${isOverloaded ? "border-overload bg-overload-soft" : "border-rule bg-paper/60"}`}>
                <span className="text-xs text-muted">Transformer Load</span>
                <p className={`text-lg font-semibold ${isOverloaded ? "text-overload" : "text-ink"}`}>
                  {latest ? formatKw(latest.grid_load_kw) : "—"}
                </p>
                <span className="text-[11px] text-muted">
                  {isOverloaded ? "⚠️ OVERLOADED" : "Safe range"}
                </span>
              </div>
              <div className="rounded border border-rule bg-paper/60 p-3">
                <span className="text-xs text-muted">Bus Voltage</span>
                <p className="text-lg font-semibold text-ink">{latest ? `${latest.voltage_v} V` : "—"}</p>
                <span className="text-[11px] text-muted">{latest ? `${latest.current_a} A phase` : "Three-phase RMS"}</span>
              </div>
              <div className="rounded border border-rule bg-paper/60 p-3">
                <span className="text-xs text-muted">Grid Frequency</span>
                <p className="text-lg font-semibold text-ink">
                  {latest ? `${latest.frequency_hz.toFixed(3)} Hz` : "—"}
                </p>
                <span className="text-[11px] text-muted">Nominal 50.00 Hz</span>
              </div>
            </div>

            {/* Live Chart */}
            <div className="h-60 w-full" role="img" aria-label="Electrical telemetry line chart">
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
                    name="Transformer load (kW)"
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

            {/* MongoDB Aggregation Stats */}
            {stats && stats.sampleCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule/80 bg-paper/40 px-3 py-2 text-xs text-muted">
                <span>
                  <strong>MongoDB Window Aggregates:</strong> Last {stats.sampleCount} readings
                </span>
                <div className="flex gap-4">
                  <span>Avg Power: <strong>{formatKw(stats.avgPowerKw)}</strong></span>
                  <span>Peak Load: <strong>{formatKw(stats.maxGridLoadKw)}</strong></span>
                  <span>Avg Bus Voltage: <strong>{stats.avgVoltage} V</strong></span>
                  <span>Avg Frequency: <strong>{stats.avgFrequency} Hz</strong></span>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* CARD 3: Regional Grid Context (Central Electricity Authority) */}
      {cea && (
        <div className="rounded border border-rule bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/70 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded bg-amber-700/10 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Regional context: Central Electricity Authority (India)
              </span>
              {cea.dataQuality === "live" ? (
                <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Live Feed
                </span>
              ) : cea.dataQuality === "partial" ? (
                <span className="rounded bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Partial Live Feed
                </span>
              ) : (
                <span className="rounded bg-paper px-2 py-0.5 text-xs font-medium text-muted">
                  Verified Benchmark
                </span>
              )}
            </div>
            <span className="text-xs text-muted">
              {cea.attribution} · {cea.reportingPeriod}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded border border-rule bg-paper/50 p-2.5">
              <span className="text-xs text-muted">Karnataka State Peak Demand</span>
              <p className="text-base font-semibold text-ink">{cea.karnatakaPeakDemandMw.toLocaleString()} MW</p>
              <span className="text-[11px] text-muted">Peak Met: {cea.karnatakaPeakMetMw.toLocaleString()} MW</span>
            </div>
            <div className="rounded border border-rule bg-paper/50 p-2.5">
              <span className="text-xs text-muted">All-India Demand Met</span>
              <p className="text-base font-semibold text-ink">{cea.nationalDemandMetMw.toLocaleString()} MW</p>
              <span className="text-[11px] text-muted">National transmission scale</span>
            </div>
            <div className="rounded border border-rule bg-paper/50 p-2.5">
              <span className="text-xs text-muted">Grid Context Scope</span>
              <p className="text-xs text-ink/80 mt-1">{cea.disclaimer}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
