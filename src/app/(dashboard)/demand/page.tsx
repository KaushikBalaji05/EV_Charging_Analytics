import { Suspense } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/api/errors";
import { pageAuth, safeStationOptions } from "@/lib/auth/page-guard";
import { getDemandAnalytics, type DemandAnalytics } from "@/lib/db/queries/demand";
import { listStationOptions, type StationOption } from "@/lib/db/queries/stations";
import { DemandQuerySchema } from "@/lib/validation/listing";
import { describeIssues, flattenSearchParams } from "@/lib/validation/params";
import { formatDay, formatHourRange, formatInr, formatInt, formatKwh } from "@/lib/format";
import { DataNoticeLoader } from "@/components/dashboard/data-notice-loader";
import { DailyDemandChart } from "@/components/dashboard/daily-demand-chart";
import { DateFields, FilterForm, SelectField } from "@/components/dashboard/filter-form";
import { HourlyDemandChart } from "@/components/dashboard/hourly-demand-chart";
import { Panel } from "@/components/dashboard/panel";
import { StatStrip } from "@/components/dashboard/stat-strip";
import { EmptyState, ErrorPanel, PageSkeleton } from "@/components/dashboard/states";

export const metadata: Metadata = { title: "Demand analytics" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function DemandPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">Demand analytics</h1>
      <Suspense fallback={<PageSkeleton />}>
        <DemandContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Filters({ options, from, to, stationId }: { options: StationOption[]; from?: string; to?: string; stationId?: string }) {
  return (
    <FilterForm action="/demand" clearHref="/demand" active={Boolean(from || to || stationId)}>
      <SelectField
        id="station_id"
        name="station_id"
        label="Station"
        value={stationId ?? ""}
        options={[{ value: "", label: "All stations" }, ...options.map((o) => ({ value: String(o.stationId), label: o.stationName }))]}
      />
      <DateFields from={from} to={to} />
    </FilterForm>
  );
}

async function DemandContent({ searchParams }: { searchParams: SearchParams }) {
  const auth = await pageAuth();
  if (!auth.ok) return <ErrorPanel title="Could not verify your session" message={auth.message} />;

  const flat = flattenSearchParams(await searchParams);
  const parsed = DemandQuerySchema.safeParse(flat);
  if (!parsed.success) {
    return (
      <>
        <Filters options={await safeStationOptions()} from={flat.from} to={flat.to} stationId={flat.station_id} />
        <ErrorPanel title="That filter is not valid" message="Fix the filter and apply again." details={describeIssues(parsed.error)} />
      </>
    );
  }

  const filter = parsed.data;
  let data: DemandAnalytics;
  let options: StationOption[];
  try {
    [data, options] = await Promise.all([getDemandAnalytics(filter), listStationOptions()]);
  } catch (err) {
    unstable_rethrow(err);
    return (
      <>
        <Filters options={[]} from={filter.from} to={filter.to} stationId={filter.stationId?.toString()} />
        <ErrorPanel title="Could not load demand analytics" message={toPublicError(err).message} />
      </>
    );
  }

  const { totals, hourly, daily, peakHour, peakDay, topHours, topDays, trend } = data;
  const empty = totals.sessions === 0;
  const stationName = options.find((o) => o.stationId === filter.stationId)?.stationName;

  return (
    <>
      <Filters options={options} from={filter.from} to={filter.to} stationId={filter.stationId?.toString()} />
      <DataNoticeLoader />
      <p className="text-sm text-muted">
        {stationName ?? "All stations"} · {filter.from || filter.to ? `${filter.from ? formatDay(filter.from) : "earliest"} to ${filter.to ? formatDay(filter.to) : "latest"}` : "all recorded dates"}
      </p>

      <StatStrip
        items={[
          { label: "Charging sessions", value: formatInt(totals.sessions), note: totals.ongoingSessions > 0 ? `${totals.ongoingSessions} still ongoing` : "Sessions that started in the period" },
          { label: "Energy delivered", value: formatKwh(totals.energyKwh) },
          { label: "Revenue", value: formatInr(totals.revenue) },
          { label: "Average per session", value: totals.avgEnergyPerSessionKwh == null ? "—" : formatKwh(totals.avgEnergyPerSessionKwh) },
          { label: "Busiest hour", value: peakHour ? formatHourRange(peakHour.hour) : "—", note: peakHour ? formatKwh(peakHour.energyKwh) : undefined },
          { label: "Busiest day", value: peakDay ? formatDay(peakDay.date) : "—", note: peakDay ? formatKwh(peakDay.energyKwh) : undefined },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Demand by hour of day" note="Each session's energy is split across the hours it spans, in proportion to the time spent in each hour.">
          {empty ? <EmptyState title="No charging sessions match this filter" hint="Try a wider date range or another station." /> : <HourlyDemandChart data={hourly} peakHour={peakHour?.hour ?? null} />}
        </Panel>
        <Panel
          title="Daily demand and trend"
          note={
            empty
              ? undefined
              : `Energy is attributed to the day a session started. The line is a 7-day moving average (fewer days at the start). ${
                  daily.truncated ? `Showing only the most recent ${daily.points.length} days; narrow the range to see earlier days.` : ""
                }`
          }
        >
          {empty || daily.points.length === 0 ? <EmptyState title="No daily data for this filter" hint="Try a wider date range or another station." /> : <DailyDemandChart data={daily.points} />}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Peak periods">
          {empty ? (
            <EmptyState title="No peak periods" hint="Peaks appear once sessions match the filter." />
          ) : (
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-muted">Top hours</h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {topHours.map((h, i) => (
                    <li key={h.hour} className="flex justify-between gap-3"><span>{i + 1}. {formatHourRange(h.hour)}</span><span>{formatKwh(h.energyKwh)}</span></li>
                  ))}
                </ol>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted">Top days</h3>
                <ol className="mt-2 space-y-1 text-sm">
                  {topDays.map((d, i) => (
                    <li key={d.date} className="flex justify-between gap-3"><span>{i + 1}. {formatDay(d.date)}</span><span>{formatKwh(d.energyKwh)}</span></li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </Panel>
        <Panel title="Trend" note="Most recent days compared with the same number of days before them.">
          {trend ? (
            <p className="text-sm">
              Last {trend.windowDays} day{trend.windowDays === 1 ? "" : "s"}: <strong>{formatKwh(trend.recentKwh)}</strong> versus {formatKwh(trend.previousKwh)} in the {trend.windowDays} before.{" "}
              {trend.changePct == null ? "There was no energy in the earlier window, so no percentage change can be given." : <strong className={trend.changePct < 0 ? "text-overload" : "text-charge"}>{trend.changePct > 0 ? "+" : ""}{trend.changePct}%</strong>}
            </p>
          ) : (
            <EmptyState title="Not enough days for a trend" hint="A trend needs at least two days in the selected range." />
          )}
        </Panel>
      </div>
    </>
  );
}
