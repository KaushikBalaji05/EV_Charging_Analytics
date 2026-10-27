import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ApiError, toPublicError } from "@/lib/api/errors";
import { pageAuth } from "@/lib/auth/page-guard";
import { getEnv } from "@/lib/env";
import { listOverloads, type OverloadList } from "@/lib/db/queries/overloads";
import { listSessions, type SessionList } from "@/lib/db/queries/sessions";
import {
  getStationCapacityHistory, getStationChargers, getStationSummary, getStationTelemetry,
  type CapacitySnapshot, type ChargerRow, type Series, type StationMetrics, type TelemetryPoint,
} from "@/lib/db/queries/stations";
import { StationDetailQuerySchema, StationIdSchema } from "@/lib/validation/listing";
import { describeIssues, flattenSearchParams } from "@/lib/validation/params";
import { buildHref } from "@/lib/url";
import { formatDuration, formatInr, formatInt, formatKw, formatKwh, formatPct, formatTimestamp } from "@/lib/format";
import { DataNoticeLoader } from "@/components/dashboard/data-notice-loader";
import { DateFilter } from "@/components/dashboard/date-filter";
import { Panel } from "@/components/dashboard/panel";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { StatusBadge, UtilizationValue } from "@/components/dashboard/status-badge";
import { EmptyState, ErrorPanel, PageSkeleton } from "@/components/dashboard/states";
import { TableShell, td, tdRight, th, thRight } from "@/components/dashboard/tables";
import { TelemetryTrendChart } from "@/components/dashboard/telemetry-trend-chart";
import { UtilizationHistoryChart } from "@/components/dashboard/utilization-history-chart";

export const metadata: Metadata = { title: "Station details" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Params = Promise<{ id: string }>;

export default function StationDetailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/stations" className="text-sm text-charge underline underline-offset-2">← All stations</Link>
      <Suspense fallback={<PageSkeleton />}>
        <StationDetailContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PREVIEW_ROWS = 10;

function StationNotFound() {
  return <ErrorPanel title="Station not found" message="There is no station with that identifier. Use the link above to browse all stations." />;
}

async function StationDetailContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const auth = await pageAuth();
  if (!auth.ok) return <ErrorPanel title="Could not verify your session" message={auth.message} />;

  const idParsed = StationIdSchema.safeParse((await params).id);
  if (!idParsed.success) return <StationNotFound />;
  const id = idParsed.data;

  const flat = flattenSearchParams(await searchParams);
  const parsed = StationDetailQuerySchema.safeParse(flat);
  if (!parsed.success) {
    return (
      <>
        <DateFilter action={`/stations/${id}`} from={flat.from} to={flat.to} />
        <ErrorPanel title="That date filter is not valid" message="Fix the dates and apply again." details={describeIssues(parsed.error)} />
      </>
    );
  }
  const range = parsed.data;

  let summary: StationMetrics | null;
  let chargers: ChargerRow[];
  let capacity: Series<CapacitySnapshot>;
  let telemetry: Series<TelemetryPoint>;
  let overloads: OverloadList;
  let sessions: SessionList;
  let dataMode: "demo" | "production";
  try {
    dataMode = getEnv().DATA_MODE;
    [summary, chargers, capacity, telemetry, overloads, sessions] = await Promise.all([
      getStationSummary(id, range),
      getStationChargers(id, range),
      getStationCapacityHistory(id, { ...range, limit: 200 }),
      getStationTelemetry(id, { ...range, limit: 200 }),
      listOverloads({ ...range, stationId: id, sort: "time", page: 1, pageSize: PREVIEW_ROWS }),
      listSessions({ ...range, stationId: id, status: "all", sort: "start", page: 1, pageSize: PREVIEW_ROWS }),
    ]);
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ApiError && err.status === 404) return <StationNotFound />;
    return (
      <>
        <DateFilter action={`/stations/${id}`} from={range.from} to={range.to} />
        <ErrorPanel title="Could not load this station" message={toPublicError(err).message} />
      </>
    );
  }
  if (!summary) return <StationNotFound />;

  const s = summary;
  const capacityAsc = [...capacity.rows].reverse(); // charts read oldest -> newest
  const telemetryAsc = [...telemetry.rows].reverse();
  const withRange = { from: range.from, to: range.to };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{s.stationName}</h1>
          <p className="mt-1 text-sm text-muted">{s.location}</p>
        </div>
        <StatusBadge status={s.operatingStatus} />
      </header>

      <DateFilter action={`/stations/${id}`} from={range.from} to={range.to} />
      <DataNoticeLoader />

      <StatStrip
        items={[
          { label: "Sessions", value: formatInt(s.sessions) },
          { label: "Energy delivered", value: formatKwh(s.energyKwh) },
          { label: "Revenue", value: formatInr(s.revenue) },
          { label: "Peak utilization", value: formatPct(s.peakUtilizationPct), note: `Average ${formatPct(s.avgUtilizationPct)}`, alert: (s.peakUtilizationPct ?? 0) > 100 },
          { label: "Overload events", value: formatInt(s.overloadEvents), alert: s.overloadEvents > 0 },
          { label: "Charger capacity", value: formatKw(s.installedChargerKw), note: `${s.chargerCount} charger${s.chargerCount === 1 ? "" : "s"} · station limit ${formatKw(s.capacityLimitKw)}` },
        ]}
      />

      <Panel title="Chargers" note="Session and energy figures follow the date filter.">
        {chargers.length === 0 ? (
          <EmptyState title="No chargers registered for this station" />
        ) : (
          <div className="-m-4">
            <TableShell caption="Chargers at this station" minWidth="32rem">
              <thead className="border-b border-rule">
                <tr>
                  <th scope="col" className={th}>Charger</th>
                  <th scope="col" className={th}>Type</th>
                  <th scope="col" className={th}>Status</th>
                  <th scope="col" className={thRight}>Rated power</th>
                  <th scope="col" className={thRight}>Sessions</th>
                  <th scope="col" className={thRight}>Energy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {chargers.map((c) => (
                  <tr key={c.chargerId}>
                    <td className={td}>#{c.chargerId}</td>
                    <td className={td}>{c.chargerType.replace(/_/g, " ")}</td>
                    <td className={td}><StatusBadge status={c.status} /></td>
                    <td className={tdRight}>{formatKw(c.ratedPowerKw)}</td>
                    <td className={tdRight}>{formatInt(c.sessions)}</td>
                    <td className={tdRight}>{formatKwh(c.energyKwh)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        )}
      </Panel>

      <Panel
        title="Capacity utilization history"
        note={`Capacity snapshots: measured load as a percentage of the permitted load. Points above the 100% line are overloads.${capacity.total > capacity.rows.length ? ` Showing the latest ${capacity.rows.length} of ${capacity.total}.` : ""}`}
      >
        {capacityAsc.length === 0 ? <EmptyState title="No capacity snapshots in this period" hint="Try a wider date range." /> : <UtilizationHistoryChart data={capacityAsc} />}
      </Panel>

      <Panel
        title="Overload history"
        note="Overloaded capacity snapshots for this station."
        action={overloads.total > 0 ? <Link href={buildHref("/overloads", { station_id: id, ...withRange })} className="text-sm text-charge underline underline-offset-2">Open in Overload explorer</Link> : undefined}
      >
        {overloads.rows.length === 0 ? (
          <EmptyState title="No overload events in this period" hint="No capacity snapshot exceeded the permitted load." />
        ) : (
          <div className="-m-4">
            <TableShell caption="Overload events at this station" minWidth="36rem">
              <thead className="border-b border-rule">
                <tr>
                  <th scope="col" className={th}>Snapshot time</th>
                  <th scope="col" className={thRight}>Load / permitted</th>
                  <th scope="col" className={thRight}>Utilization</th>
                  <th scope="col" className={thRight}>Over by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {overloads.rows.map((e) => (
                  <tr key={e.capacityId}>
                    <td className={td}>{formatTimestamp(e.recordedAt)}</td>
                    <td className={tdRight}>{formatKw(e.currentLoadKw)} / {formatKw(e.maxLoadKw)}</td>
                    <td className={tdRight}><UtilizationValue pct={e.utilizationPct} /></td>
                    <td className={`${tdRight} font-medium text-overload`}>{formatKw(e.overloadKw)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        )}
      </Panel>

      <Panel
        title="Grid telemetry"
        note={`Electrical readings from the grid_telemetry table (${dataMode === "demo" ? "synthetic demo data, not live measurements" : "stored historical readings, not a live feed"}). These are separate from capacity snapshots.${telemetry.total > telemetry.rows.length ? ` Showing the latest ${telemetry.rows.length} of ${telemetry.total}.` : ""}`}
      >
        {telemetryAsc.length === 0 ? (
          <EmptyState title="No telemetry readings in this period" hint="Try a wider date range." />
        ) : (
          <>
            <TelemetryTrendChart data={telemetryAsc} />
            <div className="-mx-4 -mb-4 mt-4 border-t border-rule">
              <TableShell caption="Most recent telemetry readings" minWidth="34rem">
                <thead className="border-b border-rule">
                  <tr>
                    <th scope="col" className={th}>Recorded</th>
                    <th scope="col" className={thRight}>Voltage</th>
                    <th scope="col" className={thRight}>Frequency</th>
                    <th scope="col" className={thRight}>Power</th>
                    <th scope="col" className={thRight}>Grid load</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {telemetry.rows.slice(0, PREVIEW_ROWS).map((r) => (
                    <tr key={r.telemetryId}>
                      <td className={td}>{formatTimestamp(r.recordedAt)}</td>
                      <td className={tdRight}>{r.voltageV == null ? "—" : `${r.voltageV} V`}</td>
                      <td className={tdRight}>{r.frequencyHz == null ? "—" : `${r.frequencyHz.toFixed(2)} Hz`}</td>
                      <td className={tdRight}>{formatKw(r.powerKw)}</td>
                      <td className={tdRight}>{formatKw(r.gridLoadKw)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title="Recent charging sessions"
        action={sessions.total > 0 ? <Link href={buildHref("/sessions", { station_id: id, ...withRange })} className="text-sm text-charge underline underline-offset-2">View all {formatInt(sessions.total)} in Session explorer</Link> : undefined}
      >
        {sessions.rows.length === 0 ? (
          <EmptyState title="No charging sessions in this period" hint="Try a wider date range." />
        ) : (
          <div className="-m-4">
            <TableShell caption="Recent charging sessions at this station" minWidth="44rem">
              <thead className="border-b border-rule">
                <tr>
                  <th scope="col" className={th}>Vehicle</th>
                  <th scope="col" className={th}>Charger</th>
                  <th scope="col" className={th}>Started</th>
                  <th scope="col" className={thRight}>Duration</th>
                  <th scope="col" className={thRight}>Energy</th>
                  <th scope="col" className={thRight}>Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {sessions.rows.map((x) => (
                  <tr key={x.sessionId}>
                    <td className={td}><span className="font-medium">{x.registrationNo}</span><p className="text-muted">{x.model}</p></td>
                    <td className={td}>#{x.chargerId} · {x.chargerType.replace(/_/g, " ")}</td>
                    <td className={td}>{formatTimestamp(x.startTime)}</td>
                    <td className={tdRight}>{x.ongoing ? "In progress" : formatDuration(x.durationMinutes)}</td>
                    <td className={tdRight}>{formatKwh(x.energyKwh)}</td>
                    <td className={tdRight}>{formatInr(x.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        )}
      </Panel>
    </>
  );
}
