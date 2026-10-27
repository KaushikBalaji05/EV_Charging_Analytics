import { formatPct } from "@/lib/format";

const TONES: Record<string, string> = {
  ACTIVE: "bg-charge-soft text-charge",
  AVAILABLE: "bg-charge-soft text-charge",
  NORMAL: "bg-charge-soft text-charge",
  IN_USE: "bg-[#e3eefb] text-[#1d4f91]",
  MAINTENANCE: "bg-[#fbf3df] text-caution",
  INACTIVE: "bg-paper text-muted",
  FAULTY: "bg-overload-soft text-overload",
  OVERLOADED: "bg-overload-soft text-overload",
};

/** Status as a labelled pill. The text always carries the meaning; colour only reinforces it. */
export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${TONES[status] ?? "bg-paper text-muted"}`}>{label}</span>;
}

/** Utilization percentage. Above 100 is shown in red with an explicit "over limit" label. */
export function UtilizationValue({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-muted">—</span>;
  if (pct > 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-overload-soft px-2 py-0.5 font-medium text-overload">
        {formatPct(pct)} <span className="text-xs">over limit</span>
      </span>
    );
  }
  return <span>{formatPct(pct)}</span>;
}
