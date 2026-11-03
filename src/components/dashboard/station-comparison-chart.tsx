"use client";

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { StationComparison } from "@/lib/db/queries/overview";
import { formatInr, formatKwh } from "@/lib/format";

const OK = "#06b6d4";
const OVER = "#f43f5e";

function StationTooltip({ active, payload }: TooltipContentProps) {
  const s = payload?.[0]?.payload as StationComparison | undefined;
  if (!active || !s) return null;
  return (
    <div className="rounded-lg border border-rule/80 bg-panel/95 backdrop-blur px-3 py-2 text-xs shadow-xl text-ink">
      <p className="font-semibold text-charge">{s.stationName}</p>
      <div className="mt-1 space-y-0.5">
        <p>Peak utilization: <strong className={(s.peakUtilizationPct ?? 0) > 100 ? "text-overload" : "text-emerald-400"}>{s.peakUtilizationPct == null ? "n/a" : `${s.peakUtilizationPct.toFixed(1)}%`}</strong></p>
        <p>Average utilization: <strong>{s.avgUtilizationPct == null ? "n/a" : `${s.avgUtilizationPct.toFixed(1)}%`}</strong></p>
        <p className="text-muted">
          {formatKwh(s.energyKwh)} · {formatInr(s.revenue)} · {s.sessions} sessions
        </p>
        {s.capacityKw != null && <p className="text-muted">Installed capacity {s.capacityKw} kW</p>}
      </div>
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
          <CartesianGrid horizontal={false} stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, max]} unit="%" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#334155" />
          <YAxis type="category" dataKey="stationName" width={130} tick={{ fontSize: 11, fill: "#cbd5e1" }} stroke="#334155" />
          <Tooltip content={StationTooltip} cursor={{ fill: "rgba(30, 41, 59, 0.4)" }} />
          <ReferenceLine x={100} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "100% limit", position: "top", fontSize: 11, fill: "#f43f5e" }} />
          <Bar dataKey="peak" barSize={20} radius={[0, 4, 4, 0]}>
            {rows.map((r) => (
              <Cell key={r.stationId} fill={r.peak > 100 ? OVER : OK} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
