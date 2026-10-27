import { unstable_rethrow } from "next/navigation";
import { getEnv } from "@/lib/env";
import { getFreshness, type Overview } from "@/lib/db/queries/overview";
import { DataNotice } from "@/components/dashboard/data-notice";

/** Fetches what DataNotice needs. If that fails, the notice is simply omitted (the page reports its own errors). */
export async function DataNoticeLoader() {
  let data: { dataMode: "demo" | "production"; freshness: Overview["freshness"] } | null = null;
  try {
    data = { dataMode: getEnv().DATA_MODE, freshness: await getFreshness() };
  } catch (err) {
    unstable_rethrow(err);
  }
  if (!data) return null;
  return <DataNotice dataMode={data.dataMode} latestTelemetryAt={data.freshness.latestTelemetryAt} latestCapacityAt={data.freshness.latestCapacityAt} />;
}
