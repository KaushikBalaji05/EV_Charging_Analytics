export function Panel({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded border border-rule bg-panel">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-rule px-4 py-3">
        <div>
          <h2 className="font-medium">{title}</h2>
          {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
