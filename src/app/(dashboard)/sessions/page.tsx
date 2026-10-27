import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/api/errors";
import { pageAuth, safeStationOptions } from "@/lib/auth/page-guard";
import { listSessions, type SessionList } from "@/lib/db/queries/sessions";
import { listStationOptions, type StationOption } from "@/lib/db/queries/stations";
import { SessionQuerySchema } from "@/lib/validation/listing";
import { describeIssues, flattenSearchParams } from "@/lib/validation/params";
import { buildHref } from "@/lib/url";
import { formatDuration, formatInr, formatInt, formatKw, formatKwh, formatTimestamp } from "@/lib/format";
import { DataNoticeLoader } from "@/components/dashboard/data-notice-loader";
import { DateFields, FilterForm, SelectField, TextField } from "@/components/dashboard/filter-form";
import { Pagination } from "@/components/dashboard/pagination";
import { Panel } from "@/components/dashboard/panel";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { EmptyState, ErrorPanel, PageSkeleton } from "@/components/dashboard/states";
import { TableShell, td, tdRight, th, thRight } from "@/components/dashboard/tables";

export const metadata: Metadata = { title: "Charging sessions" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <h1 className="text-2xl font-semibold">Charging sessions</h1>
      <Suspense fallback={<PageSkeleton />}>
        <SessionsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Filters({ options, v }: { options: StationOption[]; v: Record<string, string | undefined> }) {
  return (
    <FilterForm action="/sessions" clearHref="/sessions" active={Boolean(v.q || v.station_id || v.charger_id || v.status || v.from || v.to || v.sort || v.order)}>
      <TextField id="q" name="q" label="Search vehicle or station" value={v.q} placeholder="e.g. KA01EV1001 or Nexon" />
      <SelectField id="station_id" name="station_id" label="Station" value={v.station_id ?? ""} options={[{ value: "", label: "All stations" }, ...options.map((o) => ({ value: String(o.stationId), label: o.stationName }))]} />
      <SelectField id="status" name="status" label="Status" value={v.status ?? "all"} options={[{ value: "all", label: "All sessions" }, { value: "completed", label: "Completed" }, { value: "ongoing", label: "Ongoing" }]} />
      <SelectField id="sort" name="sort" label="Sort by" value={v.sort ?? "start"} options={[{ value: "start", label: "Start time" }, { value: "energy", label: "Energy" }, { value: "cost", label: "Cost" }, { value: "duration", label: "Duration" }, { value: "peak", label: "Peak power" }]} />
      <SelectField id="order" name="order" label="Order" value={v.order ?? ""} options={[{ value: "", label: "Newest / highest first" }, { value: "asc", label: "Oldest / lowest first" }]} />
      <DateFields from={v.from} to={v.to} />
      {v.charger_id && <input type="hidden" name="charger_id" value={v.charger_id} />}
    </FilterForm>
  );
}

async function SessionsContent({ searchParams }: { searchParams: SearchParams }) {
  const auth = await pageAuth();
  if (!auth.ok) return <ErrorPanel title="Could not verify your session" message={auth.message} />;

  const flat = flattenSearchParams(await searchParams);
  const parsed = SessionQuerySchema.safeParse(flat);
  if (!parsed.success) {
    return (
      <>
        <Filters options={await safeStationOptions()} v={flat} />
        <ErrorPanel title="That filter is not valid" message="Fix the filter and apply again." details={describeIssues(parsed.error)} />
      </>
    );
  }

  const q = parsed.data;
  let result: SessionList;
  let options: StationOption[];
  try {
    [result, options] = await Promise.all([listSessions(q), listStationOptions()]);
  } catch (err) {
    unstable_rethrow(err);
    return (
      <>
        <Filters options={[]} v={flat} />
        <ErrorPanel title="Could not load sessions" message={toPublicError(err).message} />
      </>
    );
  }

  const { totals } = result;
  const keep = { q: q.search, station_id: q.stationId, charger_id: q.chargerId, status: q.status === "all" ? undefined : q.status, from: q.from, to: q.to, sort: q.sort, order: q.order };
  const hrefFor = (page: number) => buildHref("/sessions", { ...keep, page });

  return (
    <>
      <Filters options={options} v={flat} />
      <DataNoticeLoader />
      <StatStrip
        items={[
          { label: "Matching sessions", value: formatInt(totals.sessions), note: totals.ongoingSessions > 0 ? `${totals.ongoingSessions} ongoing` : undefined },
          { label: "Energy", value: formatKwh(totals.energyKwh) },
          { label: "Revenue", value: formatInr(totals.cost) },
        ]}
      />
      <Panel title="Sessions" note="Duration is shown only for completed sessions. A session with no end time is still in progress.">
        {result.rows.length === 0 ? (
          <EmptyState title={result.total === 0 ? "No sessions match these filters" : "No sessions on this page"} hint="Try different search text, a wider date range, or clear the filters." />
        ) : (
          <div className="-m-4">
            <TableShell caption="Charging sessions" minWidth="62rem">
              <thead className="border-b border-rule">
                <tr>
                  <th scope="col" className={th}>Session</th>
                  <th scope="col" className={th}>Vehicle</th>
                  <th scope="col" className={th}>Station / charger</th>
                  <th scope="col" className={th}>Started</th>
                  <th scope="col" className={th}>Ended</th>
                  <th scope="col" className={thRight}>Duration</th>
                  <th scope="col" className={thRight}>Energy</th>
                  <th scope="col" className={thRight}>Peak power</th>
                  <th scope="col" className={thRight}>Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {result.rows.map((s) => (
                  <tr key={s.sessionId}>
                    <td className={td}>#{s.sessionId}</td>
                    <td className={td}>
                      <span className="font-medium">{s.registrationNo}</span>
                      <p className="text-muted">{s.model} · {s.ownerType.charAt(0) + s.ownerType.slice(1).toLowerCase()}</p>
                    </td>
                    <td className={td}>
                      <Link href={`/stations/${s.stationId}`} className="text-charge underline-offset-2 hover:underline">{s.stationName}</Link>
                      <p className="text-muted">Charger {s.chargerId} · {s.chargerType.replace(/_/g, " ")}</p>
                    </td>
                    <td className={td}>{formatTimestamp(s.startTime)}</td>
                    <td className={td}>
                      {s.ongoing ? <span className="rounded bg-[#e3eefb] px-2 py-0.5 text-xs font-medium text-[#1d4f91]">In progress</span> : formatTimestamp(s.endTime)}
                    </td>
                    <td className={tdRight}>{formatDuration(s.durationMinutes)}</td>
                    <td className={tdRight}>{formatKwh(s.energyKwh)}</td>
                    <td className={tdRight}>{formatKw(s.peakPowerKw)}</td>
                    <td className={tdRight}>{formatInr(s.cost)}</td>
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
