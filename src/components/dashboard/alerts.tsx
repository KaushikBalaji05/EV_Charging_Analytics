import type { OverloadEvent, TelemetryReading } from "@/lib/db/queries/overview";
import { formatKw, formatPct, formatTimestamp } from "@/lib/format";
import { EmptyState } from "@/components/dashboard/states";

const th = "px-3 py-2 text-left text-sm font-medium text-muted";
const td = "px-3 py-2 text-sm";

export function OverloadAlerts({ events }: { events: OverloadEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title="No overload events in this period" hint="No capacity snapshot exceeded its permitted load." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem]">
        <caption className="sr-only">Most recent overloaded capacity snapshots</caption>
        <thead className="border-b border-rule">
          <tr>
            <th scope="col" className={th}>Station</th>
            <th scope="col" className={th}>Snapshot time</th>
            <th scope="col" className={`${th} text-right`}>Load / limit</th>
            <th scope="col" className={`${th} text-right`}>Utilization</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {events.map((e) => (
            <tr key={e.capacityId}>
              <td className={td}>{e.stationName}</td>
              <td className={td}>{formatTimestamp(e.recordedAt)}</td>
              <td className={`${td} text-right`}>{formatKw(e.currentLoadKw)} / {formatKw(e.maxLoadKw)}</td>
              <td className={`${td} text-right`}>
                <span className="inline-flex items-center gap-1.5 rounded bg-overload-soft px-2 py-0.5 font-medium text-overload">
                  {formatPct(e.utilizationPct)}
                  <span className="text-xs">over by {formatKw(e.overloadKw)}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentTelemetry({ readings, dataMode }: { readings: TelemetryReading[]; dataMode: "demo" | "production" }) {
  if (readings.length === 0) {
    return <EmptyState title="No telemetry readings in this period" />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[38rem]">
        <caption className="sr-only">Most recent grid telemetry readings</caption>
        <thead className="border-b border-rule">
          <tr>
            <th scope="col" className={th}>Station</th>
            <th scope="col" className={th}>Recorded</th>
            <th scope="col" className={`${th} text-right`}>Voltage</th>
            <th scope="col" className={`${th} text-right`}>Frequency</th>
            <th scope="col" className={`${th} text-right`}>Grid load</th>
            <th scope="col" className={th}>Data</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {readings.map((r) => (
            <tr key={r.telemetryId}>
              <td className={td}>{r.stationName}</td>
              <td className={td}>{formatTimestamp(r.recordedAt)}</td>
              <td className={`${td} text-right`}>{r.voltageV == null ? "—" : `${r.voltageV} V`}</td>
              <td className={`${td} text-right`}>{r.frequencyHz == null ? "—" : `${r.frequencyHz.toFixed(2)} Hz`}</td>
              <td className={`${td} text-right`}>{formatKw(r.gridLoadKw)}</td>
              <td className={td}>
                <span className="rounded bg-paper px-2 py-0.5 text-xs text-muted">{dataMode === "demo" ? "Synthetic" : "Stored"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
