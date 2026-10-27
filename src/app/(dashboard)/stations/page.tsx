import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/api/errors";
import { pageAuth } from "@/lib/auth/page-guard";
import { listStations, type StationMetrics } from "@/lib/db/queries/stations";
import type { Paged } from "@/lib/db/queries/shared";
import { StationListQuerySchema } from "@/lib/validation/listing";
import { describeIssues, flattenSearchParams } from "@/lib/validation/params";
import { buildHref } from "@/lib/url";
import { formatInr, formatInt, formatKw, formatKwh } from "@/lib/format";
import { DataNoticeLoader } from "@/components/dashboard/data-notice-loader";
import { DateFields, FilterForm, SelectField, TextField } from "@/components/dashboard/filter-form";
import { Pagination } from "@/components/dashboard/pagination";
import { Panel } from "@/components/dashboard/panel";
import { StatusBadge, UtilizationValue } from "@/components/dashboard/status-badge";
import { EmptyState, ErrorPanel, PageSkeleton } from "@/components/dashboard/states";
import { TableShell, td, tdRight, th, thRight } from "@/components/dashboard/tables";

export const metadata: Metadata = { title: "Station explorer" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SORT_OPTIONS = [
  { value: "energy", label: "Energy delivered" },
  { value: "sessions", label: "Session count" },
  { value: "revenue", label: "Revenue" },
  { value: "utilization", label: "Peak utilization" },
  { value: "overloads", label: "Overload events" },
  { value: "name", label: "Name" },
  { value: "location", label: "Location" },
];

export default function StationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-semibold">Station explorer</h1>
      <Suspense fallback={<PageSkeleton />}>
        <StationsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Filters({ v }: { v: Record<string, string | undefined> }) {
  return (
    <FilterForm action="/stations" clearHref="/stations" active={Boolean(v.q || v.status || v.from || v.to || v.sort || v.order)}>
      <TextField id="q" name="q" label="Search name or location" value={v.q} placeholder="e.g. Whitefield" />
      <SelectField id="status" name="status" label="Status" value={v.status ?? ""} options={[{ value: "", label: "Any status" }, { value: "ACTIVE", label: "Active" }, { value: "INACTIVE", label: "Inactive" }, { value: "MAINTENANCE", label: "Maintenance" }]} />
      <SelectField id="sort" name="sort" label="Sort by" value={v.sort ?? "energy"} options={SORT_OPTIONS} />
      <SelectField id="order" name="order" label="Order" value={v.order ?? ""} options={[{ value: "", label: "Default" }, { value: "desc", label: "Highest / Z–A first" }, { value: "asc", label: "Lowest / A–Z first" }]} />
      <DateFields from={v.from} to={v.to} />
    </FilterForm>
  );
}

async function StationsContent({ searchParams }: { searchParams: SearchParams }) {
  const auth = await pageAuth();
  if (!auth.ok) return <ErrorPanel title="Could not verify your session" message={auth.message} />;

  const flat = flattenSearchParams(await searchParams);
  const parsed = StationListQuerySchema.safeParse(flat);
  if (!parsed.success) {
    return (
      <>
        <Filters v={flat} />
        <ErrorPanel title="That filter is not valid" message="Fix the filter and apply again." details={describeIssues(parsed.error)} />
      </>
    );
  }

  const q = parsed.data;
  let result: Paged<StationMetrics>;
  try {
    result = await listStations(q);
  } catch (err) {
    unstable_rethrow(err);
    return (
      <>
        <Filters v={flat} />
        <ErrorPanel title="Could not load stations" message={toPublicError(err).message} />
      </>
    );
  }

  const showRank = q.sort !== "name" && q.sort !== "location";
  const keep = { q: q.search, status: q.status, sort: q.sort, order: q.order, from: q.from, to: q.to };
  const hrefFor = (page: number) => buildHref("/stations", { ...keep, page });

  return (
    <>
      <Filters v={flat} />
      <DataNoticeLoader />
      <p className="text-sm text-muted">
        Session and utilization figures cover {q.from || q.to ? "the selected dates" : "all recorded dates"}. Rank is among all stations for the chosen metric.
      </p>
      <Panel title={`Stations (${formatInt(result.total)})`}>
        {result.rows.length === 0 ? (
          <EmptyState title={result.total === 0 ? "No stations match these filters" : "No stations on this page"} hint="Clear the filters to see every station." />
        ) : (
          <div className="-m-4">
            <TableShell caption="Charging stations with demand and utilization metrics" minWidth="64rem">
              <thead className="border-b border-rule">
                <tr>
                  {showRank && <th scope="col" className={th}>Rank</th>}
                  <th scope="col" className={th}>Station</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={thRight}>Chargers</th>
                  <th scope="col" className={thRight}>Sessions</th>
                  <th scope="col" className={thRight}>Energy</th>
                  <th scope="col" className={thRight}>Revenue</th>
                  <th scope="col" className={thRight}>Avg util.</th>
                  <th scope="col" className={thRight}>Peak util.</th>
                  <th scope="col" className={thRight}>Overloads</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {result.rows.map((s) => (
                  <tr key={s.stationId}>
                    {showRank && <td className={td}>{s.rank ?? "—"}</td>}
                    <td className={td}>
                      <Link href={buildHref(`/stations/${s.stationId}`, { from: q.from, to: q.to })} className="font-medium text-charge underline-offset-2 hover:underline">{s.stationName}</Link>
                      <p className="text-muted">{s.location}</p>
                    </td>
                    <td className={td}><StatusBadge status={s.operatingStatus} /></td>
                    <td className={tdRight}>
                      {s.chargerCount} · {formatKw(s.installedChargerKw)}
                      <p className="text-xs text-muted">limit {formatKw(s.capacityLimitKw)}</p>
                    </td>
                    <td className={tdRight}>{formatInt(s.sessions)}</td>
                    <td className={tdRight}>{formatKwh(s.energyKwh)}</td>
                    <td className={tdRight}>{formatInr(s.revenue)}</td>
                    <td className={tdRight}><UtilizationValue pct={s.avgUtilizationPct} /></td>
                    <td className={tdRight}><UtilizationValue pct={s.peakUtilizationPct} /></td>
                    <td className={tdRight}>{s.overloadEvents > 0 ? <span className="font-medium text-overload">{s.overloadEvents}</span> : 0}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination page={result.page} totalPages={result.totalPages} total={result.total} pageSize={result.pageSize} hrefFor={hrefFor} />
          </div>
        )}
        {result.rows.length === 0 && result.total > 0 && <Pagination page={result.page} totalPages={result.totalPages} total={result.total} pageSize={result.pageSize} hrefFor={hrefFor} />}
      </Panel>
    </>
  );
}
