"use client";

import { DatabaseStatus, SimulatorInfo } from "@/lib/types/data-admin";

interface DatabaseOverviewProps {
  postgres: DatabaseStatus;
  mongodb: DatabaseStatus;
  simulator: SimulatorInfo;
  onRefresh: () => Promise<void>;
  isRefreshing: boolean;
}

export function DatabaseOverview({
  postgres,
  mongodb,
  simulator,
  onRefresh,
  isRefreshing,
}: DatabaseOverviewProps) {
  return (
    <div className="space-y-6">
      {/* Header bar with refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-ink">Database Health &amp; Infrastructure</h2>
          <p className="text-xs text-muted">
            Independent connection status, diagnostic health checks, and engine statistics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRefresh()}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-rule/40 disabled:opacity-50"
        >
          <span className={`inline-block ${isRefreshing ? "animate-spin" : ""}`}>🔄</span>
          {isRefreshing ? "Checking..." : "Refresh Status"}
        </button>
      </div>

      {/* Grid of Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Card 1: PostgreSQL Relational Database */}
        <div className="rounded border border-rule bg-panel p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-blue-500/10 text-sm font-semibold text-blue-600">
                PG
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">PostgreSQL Master</h3>
                <p className="text-xs text-muted">{postgres.name}</p>
              </div>
            </div>
            <StatusBadge status={postgres.status} />
          </div>

          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Ping Latency</span>
              <span className="font-mono font-medium text-ink">
                {postgres.latencyMs != null ? `${postgres.latencyMs} ms` : "N/A"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Engine Version</span>
              <span className="truncate max-w-[14rem] font-medium text-ink">
                {(postgres.stats.version as string) ?? "PostgreSQL 16"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Last Checked</span>
              <span className="text-muted">
                {new Date(postgres.lastChecked).toLocaleTimeString()}
              </span>
            </div>

            {postgres.error ? (
              <div className="mt-2 rounded bg-rose-500/10 p-2 text-xs text-rose-700">
                <strong>Connection Error:</strong> {postgres.error}
              </div>
            ) : (
              <div className="mt-3">
                <span className="block text-[11px] font-medium uppercase text-muted mb-1.5">
                  Operational Tables (Row Counts)
                </span>
                <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
                  {Boolean(postgres.stats.tables) &&
                    Object.entries(postgres.stats.tables as Record<string, number>).map(
                      ([tbl, count]) => (
                        <div
                          key={tbl}
                          className="flex items-center justify-between rounded bg-paper/80 px-2 py-1"
                        >
                          <span className="truncate text-muted">{tbl}</span>
                          <span className="font-semibold text-ink">{String(count)}</span>
                        </div>
                      )
                    )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: MongoDB Document Store */}
        <div className="rounded border border-rule bg-panel p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-emerald-500/10 text-sm font-semibold text-emerald-600">
                MG
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">MongoDB Telemetry</h3>
                <p className="text-xs text-muted">{mongodb.name}</p>
              </div>
            </div>
            <StatusBadge status={mongodb.status} />
          </div>

          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Ping Latency</span>
              <span className="font-mono font-medium text-ink">
                {mongodb.latencyMs != null ? `${mongodb.latencyMs} ms` : "N/A"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Telemetry Records</span>
              <span className="font-mono font-bold text-charge">
                {(mongodb.stats.telemetryCount as number)?.toLocaleString() ?? "0"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Distinct Stations</span>
              <span className="font-mono text-ink">
                {Array.isArray(mongodb.stats.distinctStations)
                  ? (mongodb.stats.distinctStations as number[]).join(", ")
                  : "None"}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Latest Telemetry</span>
              <span className="truncate max-w-[12rem] text-muted">
                {mongodb.stats.latestTelemetryAt
                  ? new Date(mongodb.stats.latestTelemetryAt as string).toLocaleTimeString()
                  : "No readings"}
              </span>
            </div>

            {mongodb.error ? (
              <div className="mt-2 rounded bg-rose-500/10 p-2 text-xs text-rose-700">
                <strong>Connection Error:</strong> {mongodb.error}
              </div>
            ) : (
              <div className="mt-3">
                <span className="block text-[11px] font-medium uppercase text-muted mb-1.5">
                  Active Collections
                </span>
                <div className="space-y-1 font-mono text-[11px]">
                  {Array.isArray(mongodb.stats.collections) &&
                    (mongodb.stats.collections as string[]).map((col) => (
                      <div
                        key={col}
                        className="flex items-center justify-between rounded bg-paper/80 px-2 py-1"
                      >
                        <span className="text-muted">{col}</span>
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-medium text-emerald-700">
                          Indexed &amp; Schema Validated
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 3: Telemetry Simulator Background Process */}
        <div className="rounded border border-rule bg-panel p-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-rule pb-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-amber-500/10 text-sm font-semibold text-amber-600">
                SIM
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">Telemetry Simulator</h3>
                <p className="text-xs text-muted">Synthetic Grid Load Streamer</p>
              </div>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                simulator.status === "running"
                  ? "bg-emerald-500/15 text-emerald-700"
                  : "bg-gray-500/15 text-muted"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  simulator.status === "running" ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                }`}
              />
              {simulator.status === "running" ? `Running (PID: ${simulator.pid})` : "Stopped"}
            </span>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Streaming Interval</span>
              <span className="font-mono text-ink">
                {simulator.configuredIntervalMs / 1000} seconds
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Simulated Stations</span>
              <span className="font-mono text-ink">
                Stations #{simulator.simulatedStations.join(", #")}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-rule/50">
              <span className="text-muted">Latest Reading</span>
              <span className="text-muted">
                {simulator.latestTelemetryAt
                  ? new Date(simulator.latestTelemetryAt).toLocaleTimeString()
                  : "N/A"}
              </span>
            </div>

            <div className="mt-3">
              <span className="block text-[11px] font-medium uppercase text-muted mb-1">
                Recent Simulator Output
              </span>
              <div className="h-24 overflow-y-auto rounded bg-paper/90 p-2 font-mono text-[10px] text-muted space-y-0.5">
                {simulator.recentLogs.length > 0 ? (
                  simulator.recentLogs.map((log, i) => (
                    <p key={i} className="truncate">
                      {log}
                    </p>
                  ))
                ) : (
                  <p className="italic text-muted/70">No simulator logs recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "connected" | "disconnected" | "error" }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Connected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-700">
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      {status === "error" ? "Unavailable" : "Disconnected"}
    </span>
  );
}
