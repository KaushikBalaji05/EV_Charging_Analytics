"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { HourlyDemandPoint } from "@/lib/db/queries/overview";
import { formatHourRange } from "@/lib/format";

const BAR_COLOR = "#0891b2";
const PEAK_COLOR = "#06b6d4";

function HourTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as HourlyDemandPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded-xl border border-rule bg-panel-elevated/95 p-3 text-xs shadow-xl backdrop-blur-md">
      <p className="font-semibold text-ink">{formatHourRange(p.hour)}</p>
      <p className="mt-1 font-mono text-cyan-400 font-bold">{p.energyKwh.toFixed(1)} kWh delivered</p>
      <p className="text-muted mt-0.5">{p.sessions} active session{p.sessions === 1 ? "" : "s"}</p>
    </div>
  );
}

export function HourlyDemandChart({ data, peakHour }: { data: HourlyDemandPoint[]; peakHour: number | null }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Bar chart of energy delivered in kilowatt-hours for each hour of the day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -10 }}>
          <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis
            dataKey="hour"
            tickFormatter={(h: number) => String(h).padStart(2, "0")}
            interval={2}
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            stroke="#334155"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94a3b8" }}
            stroke="#334155"
            width={48}
            unit=" kWh"
          />
          <Tooltip content={HourTooltip} cursor={{ fill: "rgba(6, 182, 212, 0.08)" }} />
          <Bar dataKey="energyKwh" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.hour}
                fill={d.hour === peakHour ? PEAK_COLOR : BAR_COLOR}
                className="transition-all duration-150 hover:opacity-80"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
