"use client";

import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import type { StationDependencies, ChargerDependencies } from "@/lib/types/data-admin";

interface EntityActionModalProps {
  isOpen: boolean;
  mode: "deactivate" | "reactivate" | "delete" | "details" | null;
  entityType: "charging_station" | "charger";
  entity: Record<string, unknown> | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export function EntityActionModal({
  isOpen,
  mode,
  entityType,
  entity,
  onClose,
  onSuccess,
}: EntityActionModalProps) {
  const [internalMode, setInternalMode] = useState<"deactivate" | "reactivate" | "delete" | "details" | null>(null);
  const currentMode = internalMode ?? mode;
  const [isLoadingDeps, setIsLoadingDeps] = useState(true);
  const [dependencies, setDependencies] = useState<StationDependencies | ChargerDependencies | null>(null);
  const [depError, setDepError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const idKey = entityType === "charging_station" ? "station_id" : "charger_id";
  const entityId = entity ? Number(entity[idKey]) : null;
  const entityName =
    entityType === "charging_station"
      ? String(entity?.station_name ?? `Station #${entityId}`)
      : `Charger #${entityId} (${entity?.charger_type ?? "Unknown Type"})`;
  const currentStatus =
    entityType === "charging_station"
      ? String(entity?.operating_status ?? "UNKNOWN")
      : String(entity?.status ?? "UNKNOWN");

  useEffect(() => {
    if (!isOpen || !entityId) return;

    let active = true;
    const endpoint =
      entityType === "charging_station"
        ? `/api/admin/data/stations/${entityId}`
        : `/api/admin/data/chargers/${entityId}`;

    void fetch(endpoint)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          throw new Error(json.error?.message || `HTTP ${res.status}`);
        }
        setDependencies(json.data);
      })
      .catch((err) => {
        if (!active) return;
        setDepError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setIsLoadingDeps(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, entityId, entityType]);

  if (!isOpen || !entity) return null;

  // Handle Deactivate / Reactivate Status Update
  const handleStatusUpdate = async (targetAction: "deactivate" | "reactivate") => {
    if (!entityId) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const endpoint =
        entityType === "charging_station"
          ? `/api/admin/data/stations/${entityId}`
          : `/api/admin/data/chargers/${entityId}`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: targetAction }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status}`);
      }

      onSuccess(json.data.message || `Successfully ${targetAction}d ${entityType}.`);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Permanent Delete
  const handleDelete = async () => {
    if (!entityId) return;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const endpoint =
        entityType === "charging_station"
          ? `/api/admin/data/stations/${entityId}`
          : `/api/admin/data/chargers/${entityId}`;

      const res = await fetch(endpoint, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status}`);
      }

      onSuccess(json.data.message || `Successfully deleted ${entityType}.`);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStation = entityType === "charging_station";
  const stationDeps = isStation ? (dependencies as StationDependencies | null) : null;
  const chargerDeps = !isStation ? (dependencies as ChargerDependencies | null) : null;
  const canDelete = dependencies?.canDelete ?? false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-lg border border-rule bg-panel shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule bg-paper/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-ink">
              {currentMode === "deactivate" && "Deactivate "}
              {currentMode === "reactivate" && "Reactivate "}
              {currentMode === "delete" && "Permanently Delete "}
              {currentMode === "details" && "Record Details — "}
              <span className="font-mono text-charge">
                {isStation ? `Station #${entityId}` : `Charger #${entityId}`}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-ink hover:bg-rule/40 transition"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs">
          {/* Entity Summary Badge Card */}
          <div className="rounded border border-rule/80 bg-paper/40 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink text-sm">{entityName}</span>
              <StatusBadge status={currentStatus} />
            </div>
            {isStation && Boolean(entity.location) && (
              <p className="text-muted">
                📍 Location: <span className="text-ink font-medium">{String(entity.location)}</span>
              </p>
            )}
            {!isStation && Boolean(entity.station_id) && (
              <p className="text-muted">
                ⚡ Installed at Station: <span className="text-ink font-medium">#{String(entity.station_id)}</span>
                {chargerDeps?.stationName ? ` (${chargerDeps.stationName})` : ""}
              </p>
            )}
          </div>

          {/* Submit Error Alert */}
          {submitError && (
            <div className="rounded border border-rose-300 bg-rose-500/10 p-3 text-rose-800 font-medium">
              ✕ {submitError}
            </div>
          )}

          {/* MODE: DEACTIVATE */}
          {currentMode === "deactivate" && (
            <div className="space-y-3">
              <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2 text-amber-900">
                <div className="flex items-center gap-2 font-semibold text-amber-800">
                  <span>⚠️ Confirm Deactivation</span>
                </div>
                <p className="leading-relaxed">
                  {isStation
                    ? "Deactivating this station changes its operating status to INACTIVE. Historical charging sessions, telemetry, and capacity snapshots remain 100% preserved. No new sessions can be scheduled at this station."
                    : "Deactivating this charger changes its status to INACTIVE. All historical charging sessions remain completely preserved. No new charging sessions can be scheduled on this charger."}
                </p>
              </div>

              <p className="text-muted text-[11px]">
                ℹ️ You can safely reactivate this {isStation ? "station" : "charger"} at any time.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded border border-rule bg-paper px-3 py-1.5 font-medium text-ink hover:bg-rule/40 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusUpdate("deactivate")}
                  disabled={isSubmitting}
                  className="rounded bg-amber-600 px-4 py-1.5 font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Deactivating..." : "Confirm Deactivation"}
                </button>
              </div>
            </div>
          )}

          {/* MODE: REACTIVATE */}
          {currentMode === "reactivate" && (
            <div className="space-y-3">
              <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3.5 space-y-2 text-emerald-900">
                <div className="flex items-center gap-2 font-semibold text-emerald-800">
                  <span>✓ Confirm Reactivation</span>
                </div>
                <p className="leading-relaxed">
                  {isStation
                    ? "Reactivating this station changes its status back to ACTIVE. It will immediately be available for recording new charging sessions."
                    : "Reactivating this charger changes its status back to AVAILABLE. It will immediately be available for recording new charging sessions."}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded border border-rule bg-paper px-3 py-1.5 font-medium text-ink hover:bg-rule/40 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusUpdate("reactivate")}
                  disabled={isSubmitting}
                  className="rounded bg-emerald-600 px-4 py-1.5 font-semibold text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Reactivating..." : "Confirm Reactivation"}
                </button>
              </div>
            </div>
          )}

          {/* MODE: PERMANENT DELETE */}
          {currentMode === "delete" && (
            <div className="space-y-3">
              {isLoadingDeps ? (
                <div className="p-6 text-center text-muted animate-pulse">
                  Analyzing relational foreign keys and dependencies...
                </div>
              ) : depError ? (
                <div className="rounded border border-rose-300 bg-rose-500/10 p-3 text-rose-800">
                  Could not check dependencies: {depError}
                </div>
              ) : (
                <>
                  {/* Dependency Breakdown */}
                  <div className="rounded border border-rule bg-paper/50 p-3 space-y-2">
                    <span className="font-semibold text-muted text-[11px] uppercase tracking-wider">
                      Dependency Analysis
                    </span>
                    {isStation && stationDeps && (
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="p-2 rounded bg-panel border border-rule/60">
                          <span className="text-muted block">Installed Chargers:</span>
                          <span className="text-ink font-bold text-sm">
                            {stationDeps.dependencies.chargers}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-panel border border-rule/60">
                          <span className="text-muted block">Charging Sessions:</span>
                          <span className="text-ink font-bold text-sm">
                            {stationDeps.dependencies.sessions}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-panel border border-rule/60">
                          <span className="text-muted block">Capacity Snapshots:</span>
                          <span className="text-ink font-bold text-sm">
                            {stationDeps.dependencies.capacitySnapshots}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-panel border border-rule/60">
                          <span className="text-muted block">Telemetry Readings:</span>
                          <span className="text-ink font-bold text-sm">
                            {stationDeps.dependencies.telemetryReadings}
                          </span>
                        </div>
                      </div>
                    )}
                    {!isStation && chargerDeps && (
                      <div className="p-2 rounded bg-panel border border-rule/60 font-mono text-[11px]">
                        <span className="text-muted block">Dependent Historical Sessions:</span>
                        <span className="text-ink font-bold text-sm">
                          {chargerDeps.dependencies.sessions}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Blocked vs Eligible Banner */}
                  {!canDelete ? (
                    <div className="space-y-3">
                      <div className="rounded border border-rose-500/40 bg-rose-500/10 p-3.5 space-y-1.5 text-rose-900">
                        <div className="flex items-center gap-1.5 font-bold text-rose-800">
                          <span>🚫 Permanent Deletion Blocked</span>
                        </div>
                        <p className="leading-relaxed">
                          This {isStation ? "station" : "charger"} has dependent historical business records.
                          Permanent deletion is strictly blocked to protect database referential integrity and
                          preserve analytics history.
                        </p>
                      </div>

                      <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-2 text-amber-900">
                        <div className="flex items-center gap-1.5 font-bold text-amber-800">
                          <span>💡 Recommended Alternative: Deactivate</span>
                        </div>
                        <p className="leading-relaxed">
                          Deactivation will take this {isStation ? "station" : "charger"} out of service and
                          prevent new sessions while keeping all past data 100% intact.
                        </p>
                        <button
                          type="button"
                          onClick={() => setInternalMode("deactivate")}
                          className="mt-1 rounded bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700 transition"
                        >
                          Deactivate Instead
                        </button>
                      </div>

                      <div className="flex justify-end pt-2">
                        <button
                          type="button"
                          onClick={onClose}
                          className="rounded border border-rule bg-paper px-4 py-1.5 font-medium text-ink hover:bg-rule/40 transition"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-1 text-emerald-900">
                        <span className="font-semibold text-emerald-800">✓ Safe for Permanent Deletion</span>
                        <p>No dependent chargers, sessions, capacity, or telemetry records found.</p>
                      </div>

                      <div className="rounded border border-rose-500/30 bg-rose-500/5 p-3 space-y-2 text-ink">
                        <p className="text-rose-600 font-semibold">
                          ⚠️ This action cannot be undone. Permanent deletion will remove this record completely.
                        </p>
                        <label className="block text-[11px] font-medium text-muted">
                          Type <span className="font-mono font-bold text-rose-600">DELETE</span> to confirm:
                        </label>
                        <input
                          type="text"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          placeholder="Type DELETE"
                          className="w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-rose-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={onClose}
                          disabled={isSubmitting}
                          className="rounded border border-rule bg-paper px-3 py-1.5 font-medium text-ink hover:bg-rule/40 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={isSubmitting || confirmText.trim() !== "DELETE"}
                          className="rounded bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-700 transition disabled:opacity-40"
                        >
                          {isSubmitting ? "Deleting..." : "Permanently Delete"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* MODE: DETAILS */}
          {currentMode === "details" && (
            <div className="space-y-3">
              <div className="rounded border border-rule bg-paper divide-y divide-rule/60 text-[11px] font-mono">
                {Object.entries(entity).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-muted">{key}:</span>
                    <span className="text-ink font-semibold truncate max-w-[18rem]">
                      {value === null || value === undefined ? (
                        <span className="text-muted italic">null</span>
                      ) : (
                        String(value)
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action shortcuts */}
              <div className="flex items-center justify-between border-t border-rule pt-3">
                <div className="flex items-center gap-2">
                  {currentStatus === "ACTIVE" || currentStatus === "AVAILABLE" ? (
                    <button
                      type="button"
                      onClick={() => setInternalMode("deactivate")}
                      className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-semibold text-amber-800 hover:bg-amber-500/20 transition"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setInternalMode("reactivate")}
                      className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 font-semibold text-emerald-800 hover:bg-emerald-500/20 transition"
                    >
                      Reactivate
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setInternalMode("delete")}
                    className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-1 font-semibold text-rose-800 hover:bg-rose-500/20 transition"
                  >
                    Delete...
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="rounded border border-rule bg-paper px-3 py-1 font-medium text-ink hover:bg-rule/40 transition"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
