"use client";

import { useEffect, useState } from "react";
import { ALLOWED_MONGO_COLLECTIONS } from "@/lib/types/data-admin";
import { TableShell, td, th } from "@/components/dashboard/tables";
import { formatTime } from "@/lib/format";

export function MongoExplorer() {
  const [selectedCol, setSelectedCol] = useState<string>("grid_telemetry");
  const [stationFilter, setStationFilter] = useState<string>("");
  const [documents, setDocuments] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [inspectDoc, setInspectDoc] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          collection: selectedCol,
          page: String(page),
          limit: String(limit),
        });
        if (stationFilter) {
          params.set("stationId", stationFilter);
        }

        const res = await fetch(`/api/admin/data/mongo/records?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          throw new Error(json.error?.message || `HTTP ${res.status}`);
        }
        setDocuments(json.data.documents || []);
        setTotalCount(json.data.totalCount || 0);
        setError(null);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [selectedCol, page, limit, stationFilter]);

  const handleExportCsv = () => {
    const params = new URLSearchParams({
      collection: selectedCol,
      page: "1",
      limit: "5000",
      export: "csv",
    });
    if (stationFilter) params.set("stationId", stationFilter);
    const a = document.createElement("a");
    a.href = `/api/admin/data/mongo/records?${params.toString()}`;
    a.download = `${selectedCol}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-4">
      {/* Top Filter & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule bg-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="mongo-col-select" className="block text-[11px] font-medium text-muted uppercase">
              Collection
            </label>
            <select
              id="mongo-col-select"
              value={selectedCol}
              onChange={(e) => {
                setSelectedCol(e.target.value);
                setPage(1);
              }}
              className="mt-0.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink focus:border-charge focus:outline-none"
            >
              {ALLOWED_MONGO_COLLECTIONS.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="mongo-station-filter" className="block text-[11px] font-medium text-muted uppercase">
              Filter by Station
            </label>
            <select
              id="mongo-station-filter"
              value={stationFilter}
              onChange={(e) => {
                setStationFilter(e.target.value);
                setPage(1);
              }}
              className="mt-0.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink focus:border-charge focus:outline-none"
            >
              <option value="">All Stations</option>
              <option value="1">Station #1 (Central Charging Hub)</option>
              <option value="2">Station #2 (Tech Park Hub)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-mono">
            {totalCount.toLocaleString()} total documents
          </span>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isLoading || documents.length === 0}
            className="inline-flex items-center gap-1.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-rule/40 disabled:opacity-50"
          >
            <span>📥</span> Export CSV
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded border border-rose-300 bg-rose-500/10 p-4 text-xs text-rose-800">
          <strong>MongoDB Error:</strong> {error}
        </div>
      )}

      {/* Documents Table */}
      <div className="rounded border border-rule bg-panel shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted animate-pulse">
            Querying MongoDB collection &apos;{selectedCol}&apos;...
          </div>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">
            No telemetry documents found in &apos;{selectedCol}&apos;.
          </div>
        ) : (
          <TableShell caption={`MongoDB collection ${selectedCol}`} minWidth="56rem">
            <thead>
              <tr className="border-b border-rule bg-paper/60 text-xs">
                <th className={th}>Timestamp (UTC)</th>
                <th className={th}>Station</th>
                <th className={th}>EV Power</th>
                <th className={th}>Grid Load</th>
                <th className={th}>Voltage</th>
                <th className={th}>Current</th>
                <th className={th}>Frequency</th>
                <th className={th}>Scenario / Status</th>
                <th className={th}>Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/50 text-xs font-mono">
              {documents.map((doc, idx) => {
                const metadata = (doc.metadata as Record<string, unknown>) || {};
                const isOverloaded = Boolean(metadata.is_overloaded);
                const recDate = doc.recorded_at ? new Date(String(doc.recorded_at)) : null;

                return (
                  <tr key={String(doc._id || idx)} className="hover:bg-paper/40 transition">
                    <td className={td}>
                      <span className="text-ink font-semibold" suppressHydrationWarning>
                        {formatTime(doc.recorded_at as string | Date | null)}
                      </span>
                      <span className="block text-[10px] text-muted">
                        {recDate ? recDate.toISOString().slice(0, 10) : ""}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="font-semibold text-ink">Station #{String(doc.station_id)}</span>
                      {Boolean(metadata.station_name) && (
                        <span className="block text-[10px] text-muted truncate max-w-[10rem]">
                          {String(metadata.station_name)}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      <span className="font-semibold text-charge">
                        {Number(doc.power_kw).toFixed(2)} kW
                      </span>
                    </td>
                    <td className={td}>
                      <span className="text-ink">
                        {Number(doc.grid_load_kw).toFixed(2)} kW
                      </span>
                    </td>
                    <td className={td}>{Number(doc.voltage_v).toFixed(1)} V</td>
                    <td className={td}>{Number(doc.current_a).toFixed(1)} A</td>
                    <td className={td}>{Number(doc.frequency_hz).toFixed(2)} Hz</td>
                    <td className={td}>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                          isOverloaded
                            ? "bg-rose-500/15 text-rose-700 border border-rose-500/30"
                            : "bg-emerald-500/15 text-emerald-700"
                        }`}
                      >
                        {isOverloaded ? "OVERLOADED" : "NORMAL"}
                      </span>
                      <span className="block text-[10px] text-muted mt-0.5">
                        {String(metadata.scenario ?? "diurnal")}
                      </span>
                    </td>
                    <td className={td}>
                      <button
                        type="button"
                        onClick={() => setInspectDoc(doc)}
                        className="rounded border border-rule bg-paper px-2 py-0.5 text-[11px] font-medium text-ink hover:bg-rule/40"
                      >
                        JSON ↗
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        )}

        {/* Pagination Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-2.5 text-xs text-muted">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="rounded border border-rule bg-paper px-2 py-0.5 text-xs text-ink"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span>
              Showing Page {page} of {totalPages}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
              className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-rule/40 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="font-mono text-ink px-1">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isLoading}
              className="rounded border border-rule bg-paper px-2.5 py-1 text-xs font-medium text-ink transition hover:bg-rule/40 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Raw JSON Modal */}
      {inspectDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded border border-rule bg-panel p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-rule pb-2">
              <h3 className="font-semibold text-ink text-sm">
                MongoDB Document Inspection [ID: {String(inspectDoc._id)}]
              </h3>
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <pre className="mt-3 overflow-x-auto rounded bg-paper p-3 font-mono text-xs text-ink leading-relaxed">
              {JSON.stringify(inspectDoc, null, 2)}
            </pre>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectDoc(null)}
                className="rounded border border-rule bg-paper px-3 py-1 text-xs font-medium text-ink hover:bg-rule/40"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
