import Link from "next/link";

/** Plain GET form: works without JavaScript and produces shareable URLs (?from=...&to=...). */
export function DateFilter({ action, from, to }: { action: string; from?: string; to?: string }) {
  const field = "mt-1 block rounded-lg border border-rule bg-panel px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none focus:ring-1 focus:ring-charge";
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="from" className="text-xs font-medium uppercase tracking-wider text-muted">From</label>
        <input id="from" name="from" type="date" defaultValue={from ?? ""} className={field} />
      </div>
      <div>
        <label htmlFor="to" className="text-xs font-medium uppercase tracking-wider text-muted">To (inclusive)</label>
        <input id="to" name="to" type="date" defaultValue={to ?? ""} className={field} />
      </div>
      <button type="submit" className="rounded-lg bg-charge px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-charge-hover transition shadow-sm">
        Apply
      </button>
      {(from || to) && (
        <Link href={action} className="py-1.5 text-xs font-medium text-charge hover:text-charge-hover underline underline-offset-2">
          Clear filter
        </Link>
      )}
    </form>
  );
}
