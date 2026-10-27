import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/api/errors";
import { pageAuth, safeStationOptions } from "@/lib/auth/page-guard";
import { listOverloads, TELEMETRY_MATCH_MINUTES, type OverloadList } from "@/lib/db/queries/overloads";
import { listStationOptions, type StationOption } from "@/lib/db/queries/stations";
import { OverloadQuerySchema } from "@/lib/validation/listing";
import { describeIssues, flattenSearchParams } from "@/lib/validation/params";
import { buildHref } from "@/lib/url";
import { formatInt, formatKw, formatPct, formatTimestamp } from "@/lib/format";
import { DataNoticeLoader } from "@/components/dashboard/data-notice-loader";
import { DateFields, FilterForm, SelectField } from "@/components/dashboard/filter-form";
import { Pagination } from "@/components/dashboard/pagination";
import { Panel } from "@/components/dashboard/panel";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { UtilizationValue } from "@/components/dashboard/status-badge";
import { EmptyState, ErrorPanel, PageSkeleton } from "@/components/dashboard/states";
import { TableShell, td, tdRight, th, thRight } from "@/components/dashboard/tables";

export const metadata: Metadata = { title: "Overload explorer" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OverloadsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">Overload explorer</h1>
      <Suspense fallback={<PageSkeleton />}>
        <OverloadsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Filters({ options, v }: { options: StationOption[]; v: Record<string, string | undefined> }) {
  return (
    <FilterForm action="/overloads" clearHref="/overloads" active={Boolean(v.station_id || v.from || v.to || v.sort || v.order)}>
      <SelectField id="station_id" name="station_id" label="Station" value={v.station_id ?? ""} options={[{ value: "", label: "All stations" }, ...options.map((o) => ({ value: String(o.stationId), label: o.stationName }))]} />
      <DateFields from={v.from} to={v.to} />
      <SelectField id="sort" name="sort" label="Sort by" value={v.sort ?? "time"} options={[{ value: "time", label: "Time" }, { value: "utilization", label: "Utilization %" }, { value: "overload", label: "Overload (kW)" }]} />
      <SelectField id="order" name="order" label="Order" value={v.order ?? ""} options={[{ value: "", label: "Newest / highest first" }, { value: "asc", label: "Oldest / lowest first" }]} />
    </FilterForm>
  );
}

async function OverloadsContent({ searchParams }: { searchParams: SearchParams }) {
  const auth = await pageAuth();
  if (!auth.ok) return <ErrorPanel title="Could not verify your session" message={auth.message} />;

  const flat = flattenSearchParams(await searchParams);
  const parsed = OverloadQuerySchema.safeParse(flat);
  if (!parsed.success) {
    return (
      <>
        <Filters options={await safeStationOptions()} v={flat} />
        <ErrorPanel title="That filter is not valid" message="Fix the filter and apply again." details={describeIssues(parsed.error)} />
      </>
    );
  }

  const q = parsed.data;
  let result: OverloadList;
  let options: StationOption[];
  try {
    [result, options] = await Promise.all([listOverloads(q), listStationOptions()]);
  } catch (err) {
    unstable_rethrow(err);
    return (
      <>
        <Filters options={[]} v={flat} />
        <ErrorPanel title="Could not load overload events" message={toPublicError(err).message} />
      </>
    );
  }

  const { summary } = result;
  const keep = { station_id: q.stationId, from: q.from, to: q.to, sort: q.sort, order: q.order };
  const hrefFor = (page: number) => buildHref("/overloads", { ...keep, page });

  return (
    <>
      <Filters options={options} v={flat} />
      <DataNoticeLoader />
      <div className="rounded border border-rule bg-panel px-4 py-3 text-sm text-muted">
        <p>
          <strong className="text-ink">Capacity snapshots</strong> compare a station&apos;s measured load with its permitted load; a snapshot above 100% is an overload.{" "}
          <strong className="text-ink">Telemetry readings</strong> are separate electrical measurements. The last column shows the nearest telemetry reading within ±{TELEMETRY_MATCH_MINUTES} minutes, only for comparison.
        </p>
      </div>

      <StatStrip
        items={[
          { label: "Overload events", value: formatInt(summary.events), alert: summary.events > 0, note: "Overloaded capacity snapshots" },
          { label: "Stations affected", value: formatInt(summary.stations) },
          { label: "Peak utilization", value: formatPct(summary.peakUtilizationPct), note: "Highest snapshot in the filter" },
          { label: "Largest overload", value: formatKw(summary.maxOverloadKw), note: "Load above the permitted maximum" },
        ]}
      />

      <Panel title="Overloaded capacity snapshots">
        {result.rows.length === 0 ? (
          <EmptyState
            title={result.total === 0 ? "No overload events match these filters" : "No events on this page"}
            hint={result.total === 0 ? "No capacity snapshot in this selection exceeded its permitted load." : "Go back to the first page."}
          />
        ) : (
          <div className="-m-4">
            <TableShell caption="Overloaded capacity snapshots with the nearest telemetry reading" minWidth="56rem">
              <thead className="border-b border-rule">
                <tr>
                  <th scope="col" className={th}>Station</th>
                  <th scope="col" className={th}>Snapshot time</th>
                  <th scope="col" className={thRight}>Current load</th>
                  <th scope="col" className={thRight}>Permitted load</th>
                  <th scope="col" className={thRight}>Utilization</th>
                  <th scope="col" className={thRight}>Over by</th>
                  <th scope="col" className={th}>Nearest telemetry reading</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {result.rows.map((e) => (
                  <tr key={e.capacityId}>
                    <td className={td}>
                      <Link href={buildHref(`/stations/${e.stationId}`, { from: q.from, to: q.to })} className="font-medium text-charge underline-offset-2 hover:underline">{e.stationName}</Link>
                      <p className="text-muted">{e.location}</p>
                    </td>
                    <td className={td}>{formatTimestamp(e.recordedAt)}</td>
                    <td className={tdRight}>{formatKw(e.currentLoadKw)}</td>
                    <td className={tdRight}>{formatKw(e.maxLoadKw)}</td>
                    <td className={tdRight}><UtilizationValue pct={e.utilizationPct} /></td>
                    <td className={`${tdRight} font-medium text-overload`}>{formatKw(e.overloadKw)}</td>
                    <td className={td}>
                      {e.telemetryAt ? (
                        <>
                          {formatKw(e.telemetryGridLoadKw)} grid load
                          <p className="text-xs text-muted">{formatTimestamp(e.telemetryAt)}</p>
                        </>
                      ) : (
                        <span className="text-muted">None within ±{TELEMETRY_MATCH_MINUTES} min</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        )}
        <div className="-mx-4 -mb-4 mt-4">
          <Pagination page={result.page} totalPages={result.totalPages} total={result.total} pageSize={result.pageSize} hrefFor={hrefFor} />
        </div>
      </Panel>
    </>
  );
}
