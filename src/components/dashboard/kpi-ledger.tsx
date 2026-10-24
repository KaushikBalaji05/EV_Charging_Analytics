import type { OverviewKpis } from "@/lib/db/queries/overview";
import { formatInr, formatInt, formatKwh, formatPct } from "@/lib/format";

function Cell({ label, value, note, alert = false }: { label: string; value: string; note: string; alert?: boolean }) {
  return (
    <div className="bg-panel p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold ${alert ? "text-overload" : ""}`}>{value}</dd>
      <dd className="mt-2 text-xs leading-snug text-muted">{note}</dd>
    </div>
  );
}

export function KpiLedger({ kpis }: { kpis: OverviewKpis }) {
  const k = kpis;
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule lg:grid-cols-5">
      <Cell
        label="Charging sessions"
        value={formatInt(k.totalSessions)}
        note={k.ongoingSessions > 0 ? `${k.ongoingSessions} still ongoing (no end time)` : "Sessions that started in the period"}
      />
      <Cell label="Energy delivered" value={formatKwh(k.totalEnergyKwh)} note="Sum of energy_kwh across those sessions" />
      <Cell label="Charging revenue" value={formatInr(k.totalRevenue)} note="Sum of session cost, in INR" />
      <Cell
        label="Average utilization"
        value={formatPct(k.avgUtilizationPct)}
        note={
          k.capacitySnapshots > 0
            ? `Mean of load ÷ permitted load over ${k.capacitySnapshots} capacity snapshots. Peak ${formatPct(k.peakUtilizationPct)}`
            : "No capacity snapshots in this period"
        }
      />
      <Cell
        label="Overload events"
        value={formatInt(k.overloadEvents)}
        alert={k.overloadEvents > 0}
        note={
          k.overloadEvents > 0
            ? `Snapshots above 100% load, across ${k.overloadedStations} station${k.overloadedStations === 1 ? "" : "s"}`
            : "No snapshot exceeded permitted load"
        }
      />
    </dl>
  );
}
