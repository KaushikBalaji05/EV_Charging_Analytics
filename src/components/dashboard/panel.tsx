export function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-rule bg-panel shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-rule/70 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-ink">{title}</h2>
          {note && <p className="mt-1 text-xs text-muted leading-relaxed">{note}</p>}
        </div>
        {action}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
