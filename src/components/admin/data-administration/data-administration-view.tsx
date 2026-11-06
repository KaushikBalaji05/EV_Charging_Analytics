"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { DatabaseStatus, SimulatorInfo } from "@/lib/types/data-admin";
import { DatabaseOverview } from "./database-overview";
import { PostgresExplorer } from "./postgres-explorer";
import { MongoExplorer } from "./mongo-explorer";
import { LiveTelemetryMonitor } from "./live-telemetry-monitor";
import { DataEntryForms } from "./data-entry-forms";

export type AdminTab = "overview" | "postgres" | "mongo" | "telemetry" | "entry";

const VALID_TABS: AdminTab[] = ["overview", "postgres", "mongo", "telemetry", "entry"];

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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab") as AdminTab | null;
  const initialTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : "overview";

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [postgres, setPostgres] = useState<DatabaseStatus>(initialPostgres);
  const [mongodb, setMongodb] = useState<DatabaseStatus>(initialMongodb);
  const [simulator, setSimulator] = useState<SimulatorInfo>(initialSimulator);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sync state if URL changes externally (e.g. browser back/forward or direct link)
  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [tabParam, activeTab]);

  const handleTabClick = (tabId: AdminTab) => {
    setActiveTab(tabId);
    try {
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.set("tab", tabId);
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
    } catch {
      // Fallback if router not yet ready
    }
  };

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
      <div className="flex overflow-x-auto border-b border-rule bg-panel px-2 pt-2 rounded-t scrollbar-thin">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabClick(tab.id as AdminTab)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 whitespace-nowrap -mb-px cursor-pointer select-none rounded-t ${
                isActive
                  ? "border-charge text-charge font-semibold bg-paper/60 shadow-sm"
                  : "border-transparent text-muted hover:text-ink hover:bg-paper/40 active:bg-paper/60"
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
