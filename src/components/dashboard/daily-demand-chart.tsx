"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { DailyDemandPoint } from "@/lib/db/queries/demand";
import { formatDay, formatInr } from "@/lib/format";

function DayTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as DailyDemandPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-rule bg-panel px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatDay(p.date)}</p>
      <p>{p.energyKwh.toFixed(1)} kWh · {p.sessions} session{p.sessions === 1 ? "" : "s"}</p>
      <p className="text-muted">{formatInr(p.revenue)}</p>
      <p className="text-muted">7-day average {p.movingAvgKwh.toFixed(1)} kWh</p>
    </div>
  );
}

const shortDay = (d: string) => formatDay(d).replace(/ \d{4}$/, "");

export function DailyDemandChart({ data }: { data: DailyDemandPoint[] }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Chart of energy delivered per day in kilowatt-hours with a seven-day moving average line">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#d5dedb" />
          <XAxis dataKey="date" tickFormatter={shortDay} tick={{ fontSize: 12 }} stroke="#55666e" minTickGap={24} />
          <YAxis tick={{ fontSize: 12 }} stroke="#55666e" width={44} label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 12, fill: "#55666e" }} />
          <Tooltip content={DayTooltip} cursor={{ fill: "#f2f5f4" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="energyKwh" name="Energy per day" fill="#7fb8ae" radius={[2, 2, 0, 0]} />
          <Line dataKey="movingAvgKwh" name="7-day average" stroke="#10202a" strokeWidth={2} dot={data.length < 15} type="monotone" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
