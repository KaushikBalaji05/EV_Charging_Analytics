import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth/dal";
import { getEnv } from "@/lib/env";
import { toPublicError } from "@/lib/api/errors";
import { getOverview, type Overview } from "@/lib/db/queries/overview";
import { OverviewQuerySchema } from "@/lib/validation/overview";
import { formatHourRange, formatInt, formatKwh } from "@/lib/format";
import { DateFilter } from "@/components/dashboard/date-filter";
import { DataNotice } from "@/components/dashboard/data-notice";
import { KpiLedger } from "@/components/dashboard/kpi-ledger";
import { HourlyDemandChart } from "@/components/dashboard/hourly-demand-chart";
import { StationComparisonChart } from "@/components/dashboard/station-comparison-chart";
import { OverloadAlerts, RecentTelemetry } from "@/components/dashboard/alerts";
import { EmptyState, ErrorPanel, OverviewSkeleton } from "@/components/dashboard/states";

export const metadata: Metadata = { title: "Overview" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OverviewPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      {/* Database access and searchParams are request-time data, so they stream inside Suspense. */}
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-rule bg-panel">
      <header className="border-b border-rule px-4 py-3">
        <h2 className="font-medium">{title}</h2>
        {note && <p className="mt-0.5 text-sm text-muted">{note}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

async function OverviewContent({ searchParams }: { searchParams: SearchParams }) {
  // Authentication is checked on the server before any data is read (the proxy redirect is only a convenience).
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    unstable_rethrow(err);
    return <ErrorPanel title="Could not verify your session" message={toPublicError(err).message} />;
  }
  if (!user) redirect("/login");

  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));

  const parsed = OverviewQuerySchema.safeParse(flat);
  if (!parsed.success) {
    return (
      <>
        <DateFilter action="/" from={typeof flat.from === "string" ? flat.from : undefined} to={typeof flat.to === "string" ? flat.to : undefined} />
        <ErrorPanel
          title="That date filter is not valid"
          message="Fix the dates below and apply again."
          details={parsed.error.issues.map((i) => `${i.path.join(".") || "range"}: ${i.message}`)}
        />
      </>
    );
  }

  const { from, to } = parsed.data;
  let overview: Overview;
  let dataMode: "demo" | "production";
  try {
    dataMode = getEnv().DATA_MODE;
    overview = await getOverview({ from, to });
  } catch (err) {
    unstable_rethrow(err); // never swallow Next.js control-flow errors
    const e = toPublicError(err); // logs server-side, returns a safe message
    return (
      <>
        <DateFilter action="/" from={from} to={to} />
        <ErrorPanel title="Could not load the overview" message={e.message} />
      </>
    );
  }

  const { kpis, hourly, stations, recentOverloads, recentTelemetry, freshness } = overview;
  const peak = hourly.reduce((best, h) => (h.energyKwh > best.energyKwh ? h : best), hourly[0]);
  const hasDemand = kpis.totalSessions > 0 && peak.energyKwh > 0;

  return (
    <>
      <DateFilter action="/" from={from} to={to} />
      <DataNotice dataMode={dataMode} latestTelemetryAt={freshness.latestTelemetryAt} latestCapacityAt={freshness.latestCapacityAt} />
      <KpiLedger kpis={kpis} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Charging demand by hour of day"
          note={
            hasDemand
              ? `Busiest hour: ${formatHourRange(peak.hour)} with ${formatKwh(peak.energyKwh)} across ${formatInt(peak.sessions)} session${peak.sessions === 1 ? "" : "s"}. Session energy is spread over the hours it spans.`
              : undefined
          }
        >
          {hasDemand ? (
            <HourlyDemandChart data={hourly} peakHour={peak.hour} />
          ) : (
            <EmptyState title="No charging sessions in this period" hint="Try a wider date range, or clear the filter." />
          )}
        </Panel>

        <Panel title="Station comparison: peak utilization" note="Peak capacity-snapshot utilization per station. Bars crossing the 100% line are overloaded.">
          {stations.length === 0 ? (
            <EmptyState title="No stations found" />
          ) : kpis.capacitySnapshots === 0 ? (
            <EmptyState title="No capacity snapshots in this period" hint="Utilization is only known where a capacity snapshot was recorded." />
          ) : (
            <StationComparisonChart data={stations} />
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Recent overload alerts" note="Capacity snapshots where load exceeded the permitted maximum.">
          <OverloadAlerts events={recentOverloads} />
        </Panel>
        <Panel title="Recent grid telemetry" note="Electrical readings (voltage, frequency, load). Separate from capacity snapshots.">
          <RecentTelemetry readings={recentTelemetry} dataMode={dataMode} />
        </Panel>
      </div>
    </>
  );
}
