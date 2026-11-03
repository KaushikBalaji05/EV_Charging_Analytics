import type { OverviewKpis } from "@/lib/db/queries/overview";
import { formatInr, formatInt, formatKwh, formatPct } from "@/lib/format";

interface KpiCardProps {
  label: string;
  value: string;
  note: string;
  icon: string;
  accent: "cyan" | "emerald" | "amber" | "rose" | "violet";
  alert?: boolean;
}

const ACCENT_STYLES = {
  cyan: {
    iconBg: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20",
    badge: "text-cyan-400",
  },
  emerald: {
    iconBg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    badge: "text-emerald-400",
  },
  amber: {
    iconBg: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
    badge: "text-amber-400",
  },
  rose: {
    iconBg: "bg-rose-500/15 text-rose-400 border border-rose-500/30",
    badge: "text-rose-400",
  },
  violet: {
    iconBg: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
    badge: "text-violet-400",
  },
};

function KpiCard({ label, value, note, icon, accent, alert = false }: KpiCardProps) {
  const styles = ACCENT_STYLES[accent];

  return (
    <div
      className={`relative overflow-hidden rounded-xl border p-4 transition-all duration-200 ${
        alert
          ? "border-rose-500/40 bg-gradient-to-b from-panel to-rose-950/20 shadow-lg shadow-rose-950/20"
          : "border-rule bg-panel hover:border-charge/40 hover:shadow-md"
      }`}
    >
      <div className="flex items-center justify-between">
        <dt className="text-xs font-medium uppercase tracking-wider text-muted">{label}</dt>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm ${styles.iconBg}`}>
          {icon}
        </span>
      </div>

      <dd
        className={`mt-2 text-2xl font-bold tracking-tight font-mono ${
          alert ? "text-rose-400" : "text-ink"
        }`}
      >
        {value}
      </dd>

      <dd className="mt-2 text-xs leading-relaxed text-muted line-clamp-2">{note}</dd>
    </div>
  );
}

export function KpiLedger({ kpis }: { kpis: OverviewKpis }) {
  const k = kpis;

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        label="Charging Sessions"
        value={formatInt(k.totalSessions)}
        icon="🔌"
        accent="violet"
        note={
          k.ongoingSessions > 0
            ? `${k.ongoingSessions} currently active in progress`
            : "Total sessions recorded in timeframe"
        }
      />

      <KpiCard
        label="Energy Delivered"
        value={formatKwh(k.totalEnergyKwh)}
        icon="⚡"
        accent="cyan"
        note="Total electrical demand transferred to EVs"
      />

      <KpiCard
        label="Charging Revenue"
        value={formatInr(k.totalRevenue)}
        icon="₹"
        accent="emerald"
        note="Aggregated billing revenue across chargers"
      />

      <KpiCard
        label="Average Utilization"
        value={formatPct(k.avgUtilizationPct)}
        icon="📊"
        accent="amber"
        note={
          k.capacitySnapshots > 0
            ? `Peak reached ${formatPct(k.peakUtilizationPct)} across ${k.capacitySnapshots} snapshots`
            : "No capacity snapshots in this window"
        }
      />

      <KpiCard
        label="Overload Incidents"
        value={formatInt(k.overloadEvents)}
        icon="⚠️"
        accent="rose"
        alert={k.overloadEvents > 0}
        note={
          k.overloadEvents > 0
            ? `Load exceeded 100% capacity at ${k.overloadedStations} station${k.overloadedStations === 1 ? "" : "s"}`
            : "All station feeders operated within safe limits"
        }
      />
    </dl>
  );
}
