"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { CapacitySnapshot } from "@/lib/db/queries/stations";
import { formatKw, formatShortTimestamp, formatTimestamp } from "@/lib/format";

const OK = "#06b6d4";
const OVER = "#f43f5e";

function SnapshotTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as CapacitySnapshot | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-rule/80 bg-panel/95 backdrop-blur px-3 py-2 text-xs shadow-xl text-ink">
      <p className="font-semibold text-charge">{formatTimestamp(p.recordedAt)}</p>
      <div className="mt-1 space-y-0.5">
        <p>Utilization: <strong className={p.utilizationPct > 100 ? "text-overload" : "text-cyan-400"}>{p.utilizationPct.toFixed(1)}%</strong></p>
        <p className="text-muted">{formatKw(p.currentLoadKw)} of {formatKw(p.maxLoadKw)} permitted</p>
        {p.utilizationPct > 100 && <p className="font-semibold text-overload">Overloaded by {formatKw(p.overloadKw)}</p>}
      </div>
    </div>
  );
}

function SnapshotDot(props: { cx?: number; cy?: number; payload?: CapacitySnapshot }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return <circle cx={cx} cy={cy} r={4.5} fill={payload.utilizationPct > 100 ? OVER : OK} stroke="#0f172a" strokeWidth={1.5} />;
}

/** Utilization of capacity snapshots over time (oldest first). Points above the 100% line are red. */
export function UtilizationHistoryChart({ data }: { data: CapacitySnapshot[] }) {
  const max = Math.max(120, Math.ceil(Math.max(...data.map((d) => d.utilizationPct)) / 10) * 10 + 10);
  return (
    <div className="h-72 w-full" role="img" aria-label="Line chart of capacity snapshot utilization over time against the 100 percent limit">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#1e293b" strokeDasharray="3 3" />
          <XAxis dataKey="recordedAt" tickFormatter={formatShortTimestamp} tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#334155" minTickGap={32} />
          <YAxis domain={[0, max]} unit="%" tick={{ fontSize: 11, fill: "#94a3b8" }} stroke="#334155" width={48} />
          <Tooltip content={SnapshotTooltip} />
          <ReferenceLine y={100} stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "100% limit", position: "insideTopRight", fontSize: 11, fill: "#f43f5e" }} />
          <Line dataKey="utilizationPct" stroke="#64748b" strokeWidth={1.5} dot={SnapshotDot} isAnimationActive={false} type="linear" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
