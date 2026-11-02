import { handleAuthed, ok } from "@/lib/api/response";
import {
  getPostgresOverview,
  getMongoOverview,
  getSimulatorInfo,
} from "@/lib/db/queries/data-admin";

/**
 * GET /api/admin/data/overview
 * Protected (ADMIN only)
 * Returns independent health checks and metrics for PostgreSQL, MongoDB, and the Simulator.
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    // Run all three overview checks independently in parallel
    const [pgRes, mongoRes, simRes] = await Promise.allSettled([
      getPostgresOverview(),
      getMongoOverview(),
      getSimulatorInfo(),
    ]);

    const postgres =
      pgRes.status === "fulfilled"
        ? pgRes.value
        : {
            name: "ev_charging_analytics",
            type: "postgresql" as const,
            status: "error" as const,
            latencyMs: null,
            lastChecked: new Date().toISOString(),
            error: "Failed to evaluate PostgreSQL health",
            stats: {},
          };

    const mongodb =
      mongoRes.status === "fulfilled"
        ? mongoRes.value
        : {
            name: "ev_charging_analytics",
            type: "mongodb" as const,
            status: "error" as const,
            latencyMs: null,
            lastChecked: new Date().toISOString(),
            error: "Failed to evaluate MongoDB health",
            stats: {},
          };

    const simulator =
      simRes.status === "fulfilled"
        ? simRes.value
        : {
            status: "stopped" as const,
            pid: null,
            configuredIntervalMs: 5000,
            simulatedStations: [],
            latestTelemetryAt: null,
            recentLogs: [],
          };

    return ok({ postgres, mongodb, simulator });
  });
}
