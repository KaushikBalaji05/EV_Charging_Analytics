import type { OverloadEvent, TelemetryReading } from "@/lib/db/queries/overview";
import { formatKw, formatPct, formatTimestamp } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/states";
import { TableShell, th, td } from "@/components/dashboard/tables";

export function OverloadAlerts({ events }: { events: OverloadEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No overload events in this period" hint="No capacity snapshot exceeded its permitted load." />;
  }
  return (
    <TableShell caption="Most recent overloaded capacity snapshots" minWidth="34rem">
      <thead>
        <tr>
          <th scope="col" className={th}>Station</th>
          <th scope="col" className={th}>Snapshot time</th>
          <th scope="col" className={`${th} text-right`}>Load / limit</th>
          <th scope="col" className={`${th} text-right`}>Utilization</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule/60">
        {events.map((e) => (
          <tr key={e.capacityId} className="hover:bg-panel-elevated/40 transition">
            <td className={`${td} font-medium text-ink`}>{e.stationName}</td>
            <td className={`${td} font-mono text-xs text-muted`}>{formatTimestamp(e.recordedAt)}</td>
            <td className={`${td} text-right font-mono text-xs`}>{formatKw(e.currentLoadKw)} / {formatKw(e.maxLoadKw)}</td>
            <td className={`${td} text-right`}>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-xs font-semibold text-rose-400">
                {formatPct(e.utilizationPct)}
                <span className="text-[11px] font-normal text-rose-300/80">+{formatKw(e.overloadKw)}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

export function RecentTelemetry({ readings, dataMode }: { readings: TelemetryReading[]; dataMode: "demo" | "production" }) {
  if (readings.length === 0) {
    return <EmptyState title="No telemetry readings in this period" />;
  }
  return (
    <TableShell caption="Most recent grid telemetry readings" minWidth="38rem">
      <thead>
        <tr>
          <th scope="col" className={th}>Station</th>
          <th scope="col" className={th}>Recorded</th>
          <th scope="col" className={`${th} text-right`}>Voltage</th>
          <th scope="col" className={`${th} text-right`}>Frequency</th>
          <th scope="col" className={`${th} text-right`}>Grid load</th>
          <th scope="col" className={th}>Data</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-rule/60">
        {readings.map((r) => (
          <tr key={r.telemetryId} className="hover:bg-panel-elevated/40 transition">
            <td className={`${td} font-medium text-ink`}>{r.stationName}</td>
            <td className={`${td} font-mono text-xs text-muted`}>{formatTimestamp(r.recordedAt)}</td>
            <td className={`${td} text-right font-mono text-xs text-ink`}>{r.voltageV == null ? "—" : `${r.voltageV} V`}</td>
            <td className={`${td} text-right font-mono text-xs text-ink`}>{r.frequencyHz == null ? "—" : `${r.frequencyHz.toFixed(2)} Hz`}</td>
            <td className={`${td} text-right font-mono text-xs text-cyan-400 font-semibold`}>{formatKw(r.gridLoadKw)}</td>
            <td className={td}>
              <span className="rounded bg-panel-elevated px-2 py-0.5 text-[11px] font-mono text-muted border border-rule/50">
                {dataMode === "demo" ? "Synthetic" : "Stored"}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
