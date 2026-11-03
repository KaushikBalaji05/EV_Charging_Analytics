export interface Stat {
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
  icon?: string;
}

const COLS: Record<number, string> = {
  2: "sm:grid-cols-2 lg:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-5",
  6: "sm:grid-cols-2 lg:grid-cols-3 lg:grid-cols-6",
};

/** A modern grid of headline metric cards */
export function StatStrip({ items }: { items: Stat[] }) {
  const colClass = COLS[items.length] ?? "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <dl className={`grid gap-4 ${colClass}`}>
      {items.map((s) => (
        <div
          key={s.label}
          className={`rounded-xl border p-4 transition-all duration-150 ${
            s.alert
              ? "border-rose-500/40 bg-gradient-to-b from-panel to-rose-950/20 shadow-md"
              : "border-rule bg-panel hover:border-charge/40"
          }`}
        >
          <div className="flex items-center justify-between">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted">{s.label}</dt>
            {s.icon && <span className="text-sm opacity-80">{s.icon}</span>}
          </div>
          <dd
            className={`mt-2 text-xl font-bold font-mono ${
              s.alert ? "text-rose-400" : "text-ink"
            }`}
          >
            {s.value}
          </dd>
          {s.note && <dd className="mt-1.5 text-xs text-muted leading-relaxed">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
