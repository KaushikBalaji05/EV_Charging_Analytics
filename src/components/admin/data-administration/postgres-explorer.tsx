"use client";

import { useEffect, useState } from "react";
import { ALLOWED_PG_TABLES, TableColumnMetadata } from "@/lib/types/data-admin";
import { TableShell, td, th } from "@/components/dashboard/tables";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { EntityActionModal } from "@/components/admin/data-administration/entity-action-modal";

export function PostgresExplorer() {
  const [selectedTable, setSelectedTable] = useState<string>("charging_station");
  const [columns, setColumns] = useState<TableColumnMetadata[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(20);
  const [search, setSearch] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Modal State for Station & Charger Management
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    mode: "deactivate" | "reactivate" | "delete" | "details" | null;
    entityType: "charging_station" | "charger";
    entity: Record<string, unknown> | null;
  }>({
    isOpen: false,
    mode: null,
    entityType: "charging_station",
    entity: null,
  });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({
          table: selectedTable,
          page: String(page),
          limit: String(limit),
        });
        if (search.trim()) params.set("search", search.trim());
        if (sortBy) {
          params.set("sortBy", sortBy);
          params.set("sortOrder", sortOrder);
        }

        const res = await fetch(`/api/admin/data/postgres/records?${params.toString()}`);
        const json = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) {
          throw new Error(json.error?.message || `HTTP ${res.status}`);
        }
        setColumns(json.data.columns || []);
        setRows(json.data.rows || []);
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
  }, [selectedTable, page, limit, search, sortBy, sortOrder, refreshTrigger]);

  // Auto-dismiss success notification after 6 seconds
  useEffect(() => {
    if (!successMessage) return;
    const timer = setTimeout(() => setSuccessMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [successMessage]);

  // Handle table switch: reset page and sort
  const handleTableChange = (newTable: string) => {
    setSelectedTable(newTable);
    setPage(1);
    setSearch("");
    setSortBy("");
  };

  // Handle sort click
  const handleSort = (colName: string) => {
    if (sortBy === colName) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(colName);
      setSortOrder("asc");
    }
  };

  // CSV Export URL
  const handleExportCsv = () => {
    const params = new URLSearchParams({
      table: selectedTable,
      page: "1",
      limit: "5000",
      export: "csv",
    });
    if (search.trim()) params.set("search", search.trim());
    if (sortBy) {
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
    }
    const a = document.createElement("a");
    a.href = `/api/admin/data/postgres/records?${params.toString()}`;
    a.download = `${selectedTable}_export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isManageableTable = selectedTable === "charging_station" || selectedTable === "charger";

  const openActionModal = (
    mode: "deactivate" | "reactivate" | "delete" | "details",
    entity: Record<string, unknown>
  ) => {
    setModalState({
      isOpen: true,
      mode,
      entityType: selectedTable === "charging_station" ? "charging_station" : "charger",
      entity,
    });
  };

  const handleModalSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setRefreshTrigger((prev) => prev + 1);
  };

  const totalPages = Math.ceil(totalCount / limit) || 1;

  return (
    <div className="space-y-4">
      {/* Top Filter & Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-rule bg-panel p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label htmlFor="pg-table-select" className="block text-[11px] font-medium text-muted uppercase">
              Select Table / View
            </label>
            <select
              id="pg-table-select"
              value={selectedTable}
              onChange={(e) => handleTableChange(e.target.value)}
              className="mt-0.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink focus:border-charge focus:outline-none"
            >
              {ALLOWED_PG_TABLES.map((tbl) => (
                <option key={tbl} value={tbl}>
                  {tbl} {tbl.startsWith("v_") ? "(View)" : ""}
                  {tbl === "charging_station" || tbl === "charger" ? " ★ (Deactivation & Deletion Enabled)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="pg-search" className="block text-[11px] font-medium text-muted uppercase">
              Search Records
            </label>
            <input
              id="pg-search"
              type="text"
              placeholder="Search text fields..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="mt-0.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-muted/60 focus:border-charge focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-mono">
            {totalCount.toLocaleString()} total rows
          </span>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isLoading || rows.length === 0}
            className="inline-flex items-center gap-1.5 rounded border border-rule bg-paper px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-rule/40 disabled:opacity-50"
          >
            <span>📥</span> Export CSV
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successMessage && (
        <div className="rounded border border-emerald-400/40 bg-emerald-500/10 p-3 text-xs text-emerald-800 font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Column Schema Badges */}
      {columns.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded border border-rule/70 bg-paper/40 p-2.5 text-[11px]">
          <span className="font-semibold text-muted">Schema Columns:</span>
          {columns.map((col) => (
            <span
              key={col.name}
              className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono ${
                col.isPrimaryKey
                  ? "bg-amber-500/15 font-semibold text-amber-800 border border-amber-500/30"
                  : "bg-paper text-ink border border-rule/60"
              }`}
            >
              {col.name}
              <span className="text-[10px] text-muted">({col.dataType})</span>
              {col.isPrimaryKey && <span className="text-[9px] font-bold text-amber-700">PK</span>}
            </span>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded border border-rose-300 bg-rose-500/10 p-4 text-xs text-rose-800">
          <strong>Query Error:</strong> {error}
        </div>
      )}

      {/* Records Table */}
      <div className="rounded border border-rule bg-panel shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted animate-pulse">
            Querying PostgreSQL table &apos;{selectedTable}&apos;...
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted">
            No records found in &apos;{selectedTable}&apos; matching the current filter.
          </div>
        ) : (
          <TableShell caption={`PostgreSQL table ${selectedTable} records`} minWidth="48rem">
            <thead>
              <tr className="border-b border-rule bg-paper/60 text-xs">
                {columns.map((col) => {
                  const isSorted = sortBy === col.name;
                  return (
                    <th
                      key={col.name}
                      onClick={() => handleSort(col.name)}
                      className={`${th} cursor-pointer hover:bg-rule/30 select-none`}
                    >
                      <div className="flex items-center gap-1">
                        <span>{col.name}</span>
                        {isSorted && (
                          <span className="text-charge font-bold">
                            {sortOrder === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
                {isManageableTable && (
                  <th className={`${th} text-right min-w-[14rem]`}>
                    Management Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule/50 text-xs font-mono">
              {rows.map((row, idx) => {
                const statusValue =
                  selectedTable === "charging_station"
                    ? String(row.operating_status ?? "")
                    : selectedTable === "charger"
                    ? String(row.status ?? "")
                    : "";

                const isStation = selectedTable === "charging_station";
                const isDeactivated = isStation
                  ? statusValue === "INACTIVE"
                  : statusValue === "INACTIVE";

                return (
                  <tr key={idx} className="hover:bg-paper/40 transition">
                    {columns.map((col) => {
                      const val = row[col.name];

                      // Render status as a badge if column represents entity status
                      if (
                        (col.name === "operating_status" && selectedTable === "charging_station") ||
                        (col.name === "status" && selectedTable === "charger")
                      ) {
                        return (
                          <td key={col.name} className={td}>
                            <StatusBadge status={String(val)} />
                          </td>
                        );
                      }

                      const displayVal =
                        val === null || val === undefined ? (
                          <span className="text-muted/60 italic">null</span>
                        ) : typeof val === "object" ? (
                          JSON.stringify(val)
                        ) : (
                          String(val)
                        );

                      return (
                        <td key={col.name} className={td}>
                          <span className="truncate max-w-[16rem] block" title={String(val)}>
                            {displayVal}
                          </span>
                        </td>
                      );
                    })}

                    {/* Integrated Management Actions for Stations & Chargers */}
                    {isManageableTable && (
                      <td className={`${td} text-right whitespace-nowrap`}>
                        <div className="inline-flex items-center gap-1.5 font-sans">
                          {isDeactivated ? (
                            <button
                              type="button"
                              onClick={() => openActionModal("reactivate", row)}
                              title="Reactivate this record"
                              className="rounded px-2 py-0.5 text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 transition"
                            >
                              Reactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openActionModal("deactivate", row)}
                              title="Safely deactivate this record while preserving historical data"
                              className="rounded px-2 py-0.5 text-[11px] font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 transition"
                            >
                              Deactivate
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openActionModal("delete", row)}
                            title="Inspect dependencies and evaluate safe permanent deletion"
                            className="rounded px-2 py-0.5 text-[11px] font-semibold border border-rose-500/40 bg-rose-500/10 text-rose-800 hover:bg-rose-500/20 transition"
                          >
                            Delete
                          </button>

                          <button
                            type="button"
                            onClick={() => openActionModal("details", row)}
                            title="View full record details and relational dependencies"
                            className="rounded px-2 py-0.5 text-[11px] font-medium border border-rule bg-paper text-ink hover:bg-rule/40 transition"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    )}
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

      {/* Modal Dialog */}
      <EntityActionModal
        key={`${modalState.entityType}-${modalState.entity ? String(modalState.entity.station_id ?? modalState.entity.charger_id) : "none"}-${modalState.mode}`}
        isOpen={modalState.isOpen}
        mode={modalState.mode}
        entityType={modalState.entityType}
        entity={modalState.entity}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false, entity: null }))}
        onSuccess={handleModalSuccess}
      />
    </div>
  );
}
