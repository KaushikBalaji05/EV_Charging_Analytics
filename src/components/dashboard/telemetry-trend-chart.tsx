"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { TelemetryPoint } from "@/lib/db/queries/stations";
import { formatKw, formatShortTimestamp, formatTimestamp } from "@/lib/format";

function ReadingTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as TelemetryPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-rule/80 bg-panel/95 backdrop-blur px-3 py-2 text-xs shadow-xl text-ink">
      <p className="font-semibold text-charge">{formatTimestamp(p.recordedAt)}</p>
      <div className="mt-1 space-y-0.5">
        <p>Grid load: <strong className="text-cyan-400">{formatKw(p.gridLoadKw)}</strong></p>
        <p>Power: <strong className="text-emerald-400">{formatKw(p.powerKw)}</strong></p>
        <p className="text-muted">
          {p.voltageV == null ? "—" : `${p.voltageV} V`} · {p.frequencyHz == null ? "—" : `${p.frequencyHz.toFixed(2)} Hz`}
        </p>
      </div>
    </div>
  );
}

/** Grid telemetry readings over time (oldest first). Electrical measurements, not capacity snapshots. */
export function TelemetryTrendChart({ data }: { data: TelemetryPoint[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Line chart of grid load and power in kilowatts over time from telemetry readings">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis dataKey="recordedAt" tickFormatter={formatShortTimestamp} tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#334155" minTickGap={32} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#334155" width={52} label={{ value: "kW", angle: -90, position: "insideLeft", fontSize: 11, fill: "#94a3b8" }} />
          <Tooltip content={ReadingTooltip} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Line dataKey="gridLoadKw" name="Grid Load" stroke="#06b6d4" strokeWidth={2} dot={data.length < 40} isAnimationActive={false} />
          <Line dataKey="powerKw" name="EV Power" stroke="#10b981" strokeWidth={2} dot={data.length < 40} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
