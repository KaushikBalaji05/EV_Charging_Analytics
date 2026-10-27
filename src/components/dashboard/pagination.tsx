import Link from "next/link";
import { formatInt } from "@/lib/format";

interface Props {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}

export function Pagination({ page, totalPages, total, pageSize, hrefFor }: Props) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const link = "rounded border border-rule px-3 py-1.5 text-sm hover:bg-paper";
  const off = "rounded border border-rule px-3 py-1.5 text-sm text-muted/60";
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3 text-sm">
      <p className="text-muted">
        {page > totalPages ? `Page ${page} is past the last page.` : `Showing ${formatInt(first)}–${formatInt(last)} of ${formatInt(total)}`}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? <Link href={hrefFor(page - 1)} rel="prev" className={link}>Previous</Link> : <span aria-disabled="true" className={off}>Previous</span>}
        <span className="text-muted">Page {Math.min(page, totalPages)} of {totalPages}</span>
        {page < totalPages ? <Link href={hrefFor(page + 1)} rel="next" className={link}>Next</Link> : <span aria-disabled="true" className={off}>Next</span>}
        {page > totalPages && <Link href={hrefFor(1)} className={link}>Go to first page</Link>}
      </div>
    </nav>
  );
}
