export interface Stat {
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
}

const COLS: Record<number, string> = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" };

/** A ruled band of headline figures (same visual language as the Overview ledger). */
export function StatStrip({ items }: { items: Stat[] }) {
  return (
    <dl className={`grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule ${COLS[items.length] ?? "lg:grid-cols-4"}`}>
      {items.map((s) => (
        <div key={s.label} className="bg-panel p-4">
          <dt className="text-sm text-muted">{s.label}</dt>
          <dd className={`mt-1 text-xl font-semibold ${s.alert ? "text-overload" : ""}`}>{s.value}</dd>
          {s.note && <dd className="mt-1.5 text-xs leading-snug text-muted">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}
