"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { TelemetryPoint } from "@/lib/db/queries/stations";
import { formatKw, formatShortTimestamp, formatTimestamp } from "@/lib/format";

function ReadingTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as TelemetryPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-rule bg-panel px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatTimestamp(p.recordedAt)}</p>
      <p>Grid load {formatKw(p.gridLoadKw)}</p>
      <p>Power {formatKw(p.powerKw)}</p>
      <p className="text-muted">
        {p.voltageV == null ? "—" : `${p.voltageV} V`} · {p.frequencyHz == null ? "—" : `${p.frequencyHz.toFixed(2)} Hz`}
      </p>
    </div>
  );
}

/** Grid telemetry readings over time (oldest first). Electrical measurements, not capacity snapshots. */
export function TelemetryTrendChart({ data }: { data: TelemetryPoint[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Line chart of grid load and power in kilowatts over time from telemetry readings">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#d5dedb" />
          <XAxis dataKey="recordedAt" tickFormatter={formatShortTimestamp} tick={{ fontSize: 12 }} stroke="#55666e" minTickGap={32} />
          <YAxis tick={{ fontSize: 12 }} stroke="#55666e" width={48} label={{ value: "kW", angle: -90, position: "insideLeft", fontSize: 12, fill: "#55666e" }} />
          <Tooltip content={ReadingTooltip} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line dataKey="gridLoadKw" name="Grid load" stroke="#0b7a6b" strokeWidth={2} dot={data.length < 40} isAnimationActive={false} />
          <Line dataKey="powerKw" name="Power" stroke="#1d4f91" strokeWidth={2} dot={data.length < 40} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
