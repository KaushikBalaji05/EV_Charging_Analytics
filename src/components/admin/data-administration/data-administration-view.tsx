"use client";

import { useState, useCallback } from "react";
import { DatabaseStatus, SimulatorInfo } from "@/lib/types/data-admin";
import { DatabaseOverview } from "./database-overview";
import { PostgresExplorer } from "./postgres-explorer";
import { MongoExplorer } from "./mongo-explorer";
import { LiveTelemetryMonitor } from "./live-telemetry-monitor";
import { DataEntryForms } from "./data-entry-forms";

export type AdminTab = "overview" | "postgres" | "mongo" | "telemetry" | "simulator" | "entry";

interface DataAdministrationViewProps {
  initialPostgres: DatabaseStatus;
  initialMongodb: DatabaseStatus;
  initialSimulator: SimulatorInfo;
}

export function DataAdministrationView({
  initialPostgres,
  initialMongodb,
  initialSimulator,
}: DataAdministrationViewProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [postgres, setPostgres] = useState<DatabaseStatus>(initialPostgres);
  const [mongodb, setMongodb] = useState<DatabaseStatus>(initialMongodb);
  const [simulator, setSimulator] = useState<SimulatorInfo>(initialSimulator);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refreshOverview = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch("/api/admin/data/overview");
      if (res.ok) {
        const json = await res.json();
        setPostgres(json.data.postgres);
        setMongodb(json.data.mongodb);
        setSimulator(json.data.simulator);
      }
    } catch (err) {
      console.error("[admin] Failed to refresh overview:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const TABS = [
    { id: "overview", label: "Infrastructure Overview", icon: "📊" },
    { id: "postgres", label: "PostgreSQL Explorer", icon: "🐘" },
    { id: "mongo", label: "MongoDB Explorer", icon: "🍃" },
    { id: "telemetry", label: "Live Telemetry Monitor", icon: "⚡" },
    { id: "simulator", label: "Simulator Diagnostics", icon: "⏱️" },
    { id: "entry", label: "Controlled Data Entry", icon: "📝" },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex overflow-x-auto border-b border-rule bg-panel px-2 pt-2 rounded-t">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as AdminTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition border-b-2 whitespace-nowrap -mb-px ${
                isActive
                  ? "border-charge text-charge font-semibold bg-paper/60"
                  : "border-transparent text-muted hover:text-ink hover:bg-paper/30"
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Contents */}
      <div className="transition-all duration-150">
        {activeTab === "overview" && (
          <DatabaseOverview
            postgres={postgres}
            mongodb={mongodb}
            simulator={simulator}
            onRefresh={refreshOverview}
            isRefreshing={isRefreshing}
          />
        )}

        {activeTab === "postgres" && <PostgresExplorer />}

        {activeTab === "mongo" && <MongoExplorer />}

        {activeTab === "telemetry" && <LiveTelemetryMonitor />}

        {activeTab === "simulator" && (
          <div className="space-y-6">
            <div className="rounded border border-rule bg-panel p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <div>
                  <h3 className="text-base font-semibold text-ink">
                    Synthetic Telemetry Simulator Status
                  </h3>
                  <p className="text-xs text-muted">
                    Background process streaming continuous electrical load and voltage measurements into MongoDB.
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                    simulator.status === "running"
                      ? "bg-emerald-500/15 text-emerald-700"
                      : "bg-gray-500/15 text-muted"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      simulator.status === "running" ? "bg-emerald-500 animate-pulse" : "bg-gray-400"
                    }`}
                  />
                  {simulator.status === "running"
                    ? `Process Active (PID: ${simulator.pid})`
                    : "Process Stopped"}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded border border-rule/70 bg-paper/60 p-3">
                  <span className="text-muted block text-[11px]">Stream Cadence</span>
                  <p className="mt-1 text-base font-bold text-ink">
                    {simulator.configuredIntervalMs / 1000}s
                  </p>
                  <span className="text-[10px] text-muted">Per station reading cycle</span>
                </div>

                <div className="rounded border border-rule/70 bg-paper/60 p-3">
                  <span className="text-muted block text-[11px]">Simulated Stations</span>
                  <p className="mt-1 text-base font-bold text-ink">
                    {simulator.simulatedStations.length} Stations
                  </p>
                  <span className="text-[10px] text-muted">
                    #{simulator.simulatedStations.join(", #")} (Bengaluru Hubs)
                  </span>
                </div>

                <div className="rounded border border-rule/70 bg-paper/60 p-3">
                  <span className="text-muted block text-[11px]">Latest Recorded Timestamp</span>
                  <p className="mt-1 text-sm font-bold text-charge truncate font-mono">
                    {simulator.latestTelemetryAt
                      ? new Date(simulator.latestTelemetryAt).toLocaleTimeString()
                      : "N/A"}
                  </p>
                  <span className="text-[10px] text-muted">Verified in MongoDB</span>
                </div>

                <div className="rounded border border-rule/70 bg-paper/60 p-3">
                  <span className="text-muted block text-[11px]">Diurnal Load Modeling</span>
                  <p className="mt-1 text-sm font-bold text-emerald-700">Active (IST Profile)</p>
                  <span className="text-[10px] text-muted">Evening &amp; Morning Peaks</span>
                </div>
              </div>

              <div className="mt-5">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  Live Log Output (.simulator.log)
                </h4>
                <div className="h-48 overflow-y-auto rounded border border-rule bg-paper p-3 font-mono text-xs text-ink/90 space-y-1">
                  {simulator.recentLogs.length > 0 ? (
                    simulator.recentLogs.map((log, idx) => (
                      <p key={idx} className="leading-relaxed">
                        {log}
                      </p>
                    ))
                  ) : (
                    <p className="italic text-muted">
                      No log entries recorded in .simulator.log. Start the simulator using &apos;npm run simulator:start&apos;.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "entry" && <DataEntryForms onSuccess={refreshOverview} />}
      </div>
    </div>
  );
}
