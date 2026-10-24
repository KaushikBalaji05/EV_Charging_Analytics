import { formatTimestamp } from "@/lib/format";
import { APP_CONFIG } from "@/lib/config";

interface Props {
  dataMode: "demo" | "production";
  latestTelemetryAt: string | null;
  latestCapacityAt: string | null;
}

/** States where the data comes from, whether it is synthetic, and how recent it is. Never implies "live". */
export function DataNotice({ dataMode, latestTelemetryAt, latestCapacityAt }: Props) {
  const demo = dataMode === "demo";
  return (
    <div
      className={`rounded border px-4 py-3 text-sm ${
        demo ? "border-caution/30 bg-[#fbf3df]" : "border-rule bg-panel"
      }`}
    >
      <p className="font-medium">
        {demo ? "Demo dataset: synthetic test data, not live measurements." : "Stored historical readings (not a live feed)."}
      </p>
      <p className="mt-1 text-muted">
        Source: PostgreSQL. Latest telemetry reading: {formatTimestamp(latestTelemetryAt)}. Latest capacity snapshot:{" "}
        {formatTimestamp(latestCapacityAt)}. Times are shown as {APP_CONFIG.timezoneLabel}.
      </p>
    </div>
  );
}
