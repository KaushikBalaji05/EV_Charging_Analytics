"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { StationComparison } from "@/lib/db/queries/overview";
import { formatInr, formatKwh } from "@/lib/format";

const OK = "#0b7a6b";
const OVER = "#b83a0c";

function StationTooltip({ active, payload }: TooltipContentProps) {
  const s = payload?.[0]?.payload as StationComparison | undefined;
  if (!active || !s) return null;
  return (
    <div className="rounded border border-rule bg-panel px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{s.stationName}</p>
      <p>Peak utilization {s.peakUtilizationPct == null ? "n/a" : `${s.peakUtilizationPct.toFixed(1)}%`}</p>
      <p>Average utilization {s.avgUtilizationPct == null ? "n/a" : `${s.avgUtilizationPct.toFixed(1)}%`}</p>
      <p className="text-muted">
        {formatKwh(s.energyKwh)} · {formatInr(s.revenue)} · {s.sessions} sessions
      </p>
      {s.capacityKw != null && <p className="text-muted">Installed capacity {s.capacityKw} kW</p>}
    </div>
  );
}

/** Horizontal bars of peak utilization. The 100% line is fixed, so an overloaded station visibly crosses it. */
export function StationComparisonChart({ data }: { data: StationComparison[] }) {
  const rows = data.map((s) => ({ ...s, peak: s.peakUtilizationPct ?? 0 }));
  const max = Math.max(120, ...rows.map((r) => Math.ceil(r.peak / 10) * 10 + 10));
  const height = Math.max(200, rows.length * 56 + 60);
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Bar chart of each station's peak capacity utilization against the 100 percent limit">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="#d5dedb" />
          <XAxis type="number" domain={[0, max]} unit="%" tick={{ fontSize: 12 }} stroke="#55666e" />
          <YAxis type="category" dataKey="stationName" width={130} tick={{ fontSize: 12 }} stroke="#55666e" />
          <Tooltip content={StationTooltip} cursor={{ fill: "#f2f5f4" }} />
          <ReferenceLine x={100} stroke="#10202a" strokeWidth={2} label={{ value: "100% limit", position: "top", fontSize: 12, fill: "#10202a" }} />
          <Bar dataKey="peak" barSize={22} radius={[0, 2, 2, 0]}>
            {rows.map((r) => (
              <Cell key={r.stationId} fill={r.peak > 100 ? OVER : OK} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
