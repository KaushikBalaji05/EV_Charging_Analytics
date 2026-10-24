import Link from "next/link";

/** Plain GET form: works without JavaScript and produces shareable URLs (?from=...&to=...). */
export function DateFilter({ action, from, to }: { action: string; from?: string; to?: string }) {
  const field = "mt-1 block rounded border border-rule bg-panel px-2 py-1.5 text-sm";
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="from" className="text-sm text-muted">From</label>
        <input id="from" name="from" type="date" defaultValue={from ?? ""} className={field} />
      </div>
      <div>
        <label htmlFor="to" className="text-sm text-muted">To (inclusive)</label>
        <input id="to" name="to" type="date" defaultValue={to ?? ""} className={field} />
      </div>
      <button type="submit" className="rounded bg-charge px-4 py-1.5 text-sm font-medium text-white hover:bg-charge/90">
        Apply
      </button>
      {(from || to) && (
        <Link href={action} className="py-1.5 text-sm text-charge underline underline-offset-2">
          Clear filter
        </Link>
      )}
    </form>
  );
}
