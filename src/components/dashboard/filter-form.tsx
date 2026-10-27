import Link from "next/link";

const control = "mt-1 block rounded border border-rule bg-panel px-2 py-1.5 text-sm";

/** Plain GET form: no client JavaScript needed, and every filter state is a shareable URL. */
export function FilterForm({ action, clearHref, active, children }: { action: string; clearHref: string; active: boolean; children: React.ReactNode }) {
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      {children}
      <button type="submit" className="rounded bg-charge px-4 py-1.5 text-sm font-medium text-white hover:bg-charge/90">Apply</button>
      {active && <Link href={clearHref} className="py-1.5 text-sm text-charge underline underline-offset-2">Clear filters</Link>}
    </form>
  );
}

export function TextField({ id, name, label, value, placeholder, width = "w-56" }: { id: string; name: string; label: string; value?: string; placeholder?: string; width?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-muted">{label}</label>
      <input id={id} name={name} type="search" defaultValue={value ?? ""} placeholder={placeholder} maxLength={100} className={`${control} ${width}`} />
    </div>
  );
}

export function SelectField({ id, name, label, value, options }: { id: string; name: string; label: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm text-muted">{label}</label>
      <select id={id} name={name} defaultValue={value ?? options[0]?.value} className={control}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function DateFields({ from, to }: { from?: string; to?: string }) {
  return (
    <>
      <div>
        <label htmlFor="from" className="text-sm text-muted">From</label>
        <input id="from" name="from" type="date" defaultValue={from ?? ""} className={control} />
      </div>
      <div>
        <label htmlFor="to" className="text-sm text-muted">To (inclusive)</label>
        <input id="to" name="to" type="date" defaultValue={to ?? ""} className={control} />
      </div>
    </>
  );
}
