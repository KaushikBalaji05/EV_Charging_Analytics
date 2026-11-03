import Link from "next/link";

const control = "mt-1 block rounded-lg border border-rule bg-panel px-3 py-1.5 text-xs text-ink placeholder:text-muted/60 focus:border-charge focus:outline-none focus:ring-1 focus:ring-charge";

/** Plain GET form: no client JavaScript needed, and every filter state is a shareable URL. */
export function FilterForm({ action, clearHref, active, children }: { action: string; clearHref: string; active: boolean; children: React.ReactNode }) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      {children}
      <button type="submit" className="rounded-lg bg-charge px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-charge-hover transition shadow-sm">
        Apply
      </button>
      {active && (
        <Link href={clearHref} className="py-1.5 text-xs font-medium text-charge hover:text-charge-hover underline underline-offset-2">
          Clear filters
        </Link>
      )}
    </form>
  );
}

export function TextField({ id, name, label, value, placeholder, width = "w-56" }: { id: string; name: string; label: string; value?: string; placeholder?: string; width?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">{label}</label>
      <input id={id} name={name} type="search" defaultValue={value ?? ""} placeholder={placeholder} maxLength={100} className={`${control} ${width}`} />
    </div>
  );
}

export function SelectField({ id, name, label, value, options }: { id: string; name: string; label: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-muted">{label}</label>
      <select id={id} name={name} defaultValue={value ?? options[0]?.value} className={control}>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-panel text-ink">{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function DateFields({ from, to }: { from?: string; to?: string }) {
  return (
    <>
      <div>
        <label htmlFor="from" className="text-xs font-medium uppercase tracking-wider text-muted">From</label>
        <input id="from" name="from" type="date" defaultValue={from ?? ""} className={control} />
      </div>
      <div>
        <label htmlFor="to" className="text-xs font-medium uppercase tracking-wider text-muted">To (inclusive)</label>
        <input id="to" name="to" type="date" defaultValue={to ?? ""} className={control} />
      </div>
    </>
  );
}
