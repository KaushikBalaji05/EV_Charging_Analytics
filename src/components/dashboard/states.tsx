export function ErrorPanel({ title, message, details }: { title: string; message: string; details?: string[] }) {
  return (
    <div role="alert" className="rounded border border-overload/40 bg-overload-soft p-4 text-sm text-ink">
      <p className="font-semibold text-overload">{title}</p>
      <p className="mt-1">{message}</p>
      {details && details.length > 0 && (
        <ul className="mt-2 list-disc pl-5">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
    </div>
  );
}

const block = "animate-pulse rounded bg-rule/70 motion-reduce:animate-none";

export function OverviewSkeleton() {
  return (
    <div role="status" aria-label="Loading overview" className="space-y-6">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded border border-rule bg-rule lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-3 bg-panel p-4">
            <div className={`${block} h-3 w-20`} />
            <div className={`${block} h-8 w-28`} />
            <div className={`${block} h-3 w-full`} />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${block} h-80`} />
        <div className={`${block} h-80`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`${block} h-52`} />
        <div className={`${block} h-52`} />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Generic loading placeholder for list/analytics pages. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-6">
      <div className={`${block} h-16`} />
      <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${block} h-24`} />
        ))}
      </div>
      <div className={`${block} h-72`} />
      <div className={`${block} h-48`} />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
