"use client";

import { useState, useCallback } from "react";
import { DatabaseStatus, SimulatorInfo } from "@/lib/types/data-admin";
import { DatabaseOverview } from "./database-overview";
import { PostgresExplorer } from "./postgres-explorer";
import { MongoExplorer } from "./mongo-explorer";
import { LiveTelemetryMonitor } from "./live-telemetry-monitor";
import { DataEntryForms } from "./data-entry-forms";

export type AdminTab = "overview" | "postgres" | "mongo" | "telemetry" | "entry";

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

        {activeTab === "telemetry" && (
          <LiveTelemetryMonitor initialSimulator={simulator} />
        )}

        {activeTab === "entry" && <DataEntryForms onSuccess={refreshOverview} />}
      </div>
    </div>
  );
}
