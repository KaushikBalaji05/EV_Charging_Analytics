import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { toPublicError } from "@/lib/api/errors";
import { getCurrentUser } from "@/lib/auth/dal";
import {
  getPostgresOverview,
  getMongoOverview,
  getSimulatorInfo,
} from "@/lib/db/queries/data-admin";
import { DataAdministrationView } from "@/components/admin/data-administration/data-administration-view";
import { ErrorPanel, PageSkeleton } from "@/components/dashboard/states";

export const metadata: Metadata = { title: "Data administration" };

export default function DataAdministrationPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Data Administration</h1>
        <p className="mt-1 text-sm text-muted">
          Unified administration and operations dashboard for PostgreSQL relational storage and MongoDB telemetry.
        </p>
      </div>

      <Suspense fallback={<PageSkeleton />}>
        <DataAdminContent />
      </Suspense>
    </div>
  );
}

async function DataAdminContent() {
  let user;
  try {
    user = await getCurrentUser();
  } catch (err) {
    unstable_rethrow(err);
    return (
      <ErrorPanel
        title="Could not verify your session"
        message={toPublicError(err).message}
      />
    );
  }

  if (!user) {
    redirect("/login");
  }

  // Strict server-side RBAC check
  if (user.role !== "ADMIN") {
    return (
      <ErrorPanel
        title="Administrator Access Required"
        message="Your account does not have permission to access database administration tools."
      />
    );
  }

  // Load initial health state in parallel with independent fault tolerance
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
          error: "Failed to evaluate PostgreSQL connection",
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
          error: "Failed to evaluate MongoDB connection",
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

  return (
    <DataAdministrationView
      initialPostgres={postgres}
      initialMongodb={mongodb}
      initialSimulator={simulator}
    />
  );
}
