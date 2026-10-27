"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { CapacitySnapshot } from "@/lib/db/queries/stations";
import { formatKw, formatShortTimestamp, formatTimestamp } from "@/lib/format";

const OK = "#0b7a6b";
const OVER = "#b83a0c";

function SnapshotTooltip({ active, payload }: TooltipContentProps) {
  const p = payload?.[0]?.payload as CapacitySnapshot | undefined;
  if (!active || !p) return null;
  return (
    <div className="rounded border border-rule bg-panel px-3 py-2 text-sm shadow-sm">
      <p className="font-medium">{formatTimestamp(p.recordedAt)}</p>
      <p>Utilization {p.utilizationPct.toFixed(1)}%</p>
      <p className="text-muted">{formatKw(p.currentLoadKw)} of {formatKw(p.maxLoadKw)} permitted</p>
      {p.utilizationPct > 100 && <p className="font-medium text-overload">Overloaded by {formatKw(p.overloadKw)}</p>}
    </div>
  );
}

function SnapshotDot(props: { cx?: number; cy?: number; payload?: CapacitySnapshot }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload) return null;
  return <circle cx={cx} cy={cy} r={5} fill={payload.utilizationPct > 100 ? OVER : OK} stroke="#ffffff" strokeWidth={1.5} />;
}

/** Utilization of capacity snapshots over time (oldest first). Points above the 100% line are red. */
export function UtilizationHistoryChart({ data }: { data: CapacitySnapshot[] }) {
  const max = Math.max(120, Math.ceil(Math.max(...data.map((d) => d.utilizationPct)) / 10) * 10 + 10);
  return (
    <div className="h-72 w-full" role="img" aria-label="Line chart of capacity snapshot utilization over time against the 100 percent limit">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="#d5dedb" />
          <XAxis dataKey="recordedAt" tickFormatter={formatShortTimestamp} tick={{ fontSize: 12 }} stroke="#55666e" minTickGap={32} />
          <YAxis domain={[0, max]} unit="%" tick={{ fontSize: 12 }} stroke="#55666e" width={48} />
          <Tooltip content={SnapshotTooltip} />
          <ReferenceLine y={100} stroke="#10202a" strokeWidth={2} label={{ value: "100% limit", position: "insideTopRight", fontSize: 12, fill: "#10202a" }} />
          <Line dataKey="utilizationPct" stroke="#55666e" strokeWidth={1.5} dot={SnapshotDot} isAnimationActive={false} type="linear" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
