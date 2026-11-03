"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { DailyDemandPoint } from "@/lib/db/queries/demand";
import { formatDay, formatInr } from "@/lib/format";

function DayTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as DailyDemandPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-rule bg-panel-elevated/95 p-3 text-xs shadow-xl backdrop-blur-md">
      <p className="font-semibold text-ink">{formatDay(p.date)}</p>
      <p className="mt-1 font-mono text-cyan-400 font-bold">
        {p.energyKwh.toFixed(1)} kWh · {p.sessions} session{p.sessions === 1 ? "" : "s"}
      </p>
      <p className="text-emerald-400 font-mono mt-0.5">{formatInr(p.revenue)} revenue</p>
      <p className="text-muted mt-0.5">7-day moving avg: {p.movingAvgKwh.toFixed(1)} kWh</p>
    </div>
  );
}

const shortDay = (d: string) => formatDay(d).replace(/ \d{4}$/, "");

export function DailyDemandChart({ data }: { data: DailyDemandPoint[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Chart of energy delivered per day in kilowatt-hours with a seven-day moving average line">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -10 }}>
          <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDay}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            stroke="#334155"
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            stroke="#334155"
            width={48}
            unit=" kWh"
          />
          <Tooltip content={DayTooltip} cursor={{ fill: "rgba(6, 182, 212, 0.08)" }} />
          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
          <Bar dataKey="energyKwh" name="Energy Delivered (kWh)" fill="#0891b2" radius={[4, 4, 0, 0]} />
          <Line
            dataKey="movingAvgKwh"
            name="7-day Trend"
            stroke="#22d3ee"
            strokeWidth={2}
            dot={data.length < 15 ? { r: 3, fill: "#22d3ee" } : false}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
