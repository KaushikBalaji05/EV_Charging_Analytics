"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { HourlyDemandPoint } from "@/lib/db/queries/overview";
import { formatHourRange } from "@/lib/format";

const BAR = "#7fb8ae";
const PEAK = "#0b7a6b";

function HourTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as HourlyDemandPoint | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-rule bg-panel px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatHourRange(p.hour)}</p>
      <p>{p.energyKwh.toFixed(1)} kWh delivered</p>
      <p className="text-muted">{p.sessions} session{p.sessions === 1 ? "" : "s"} active</p>
    </div>
  );
}

export function HourlyDemandChart({ data, peakHour }: { data: HourlyDemandPoint[]; peakHour: number | null }) {
  return (
    <div className="h-72 w-full" role="img" aria-label="Bar chart of energy delivered in kilowatt-hours for each hour of the day">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#d5dedb" />
          <XAxis dataKey="hour" tickFormatter={(h: number) => String(h).padStart(2, "0")} interval={2} tick={{ fontSize: 12 }} stroke="#55666e" />
          <YAxis tick={{ fontSize: 12 }} stroke="#55666e" width={44} label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 12, fill: "#55666e" }} />
          <Tooltip content={HourTooltip} cursor={{ fill: "#f2f5f4" }} />
          <Bar dataKey="energyKwh" radius={[2, 2, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.hour} fill={d.hour === peakHour ? PEAK : BAR} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
