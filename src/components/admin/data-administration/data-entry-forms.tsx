"use client";

import { useState, useEffect } from "react";
import {
  StationOptionItem,
  ChargerOptionItem,
  EvOptionItem,
} from "@/lib/types/data-admin";

interface DataEntryFormsProps {
  onSuccess: () => void;
}

export function DataEntryForms({ onSuccess }: DataEntryFormsProps) {
  const [activeForm, setActiveForm] = useState<"station" | "session">("station");
  const [options, setOptions] = useState<{
    stations: StationOptionItem[];
    chargers: ChargerOptionItem[];
    evs: EvOptionItem[];
  }>({ stations: [], chargers: [], evs: [] });
  const [isLoadingOptions, setIsLoadingOptions] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Station Form State
  const [stationName, setStationName] = useState("");
  const [location, setLocation] = useState("");
  const [totalCapacityKw, setTotalCapacityKw] = useState("100");
  const [operatingStatus, setOperatingStatus] = useState<"ACTIVE" | "INACTIVE" | "MAINTENANCE">("ACTIVE");

  // Session Form State
  const [selectedStationId, setSelectedStationId] = useState<string>("");
  const [selectedChargerId, setSelectedChargerId] = useState<string>("");
  const [selectedEvId, setSelectedEvId] = useState<string>("");
  const [startTime, setStartTime] = useState<string>(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [endTime, setEndTime] = useState<string>("");
  const [energyKwh, setEnergyKwh] = useState<string>("25.0");
  const [peakPowerKw, setPeakPowerKw] = useState<string>("45.0");
  const [cost, setCost] = useState<string>("300.0");

  const availableChargers = options.chargers.filter(
    (c) => String(c.stationId) === selectedStationId
  );
  const currentStation = options.stations.find((st) => String(st.stationId) === selectedStationId);
  const isStationInactive = currentStation ? currentStation.status !== "ACTIVE" : false;
  const currentCharger = availableChargers.find((c) => String(c.chargerId) === selectedChargerId);
  const isChargerInactive = currentCharger ? (currentCharger.status === "INACTIVE" || currentCharger.status === "FAULTY") : false;

  const fetchOptions = async () => {
    try {
      const res = await fetch("/api/admin/data/options");
      if (res.ok) {
        const json = await res.json();
        setOptions(json.data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/data/options");
        if (res.ok) {
          const json = await res.json();
          if (!active) return;
          setOptions(json.data);
          if (json.data.stations.length > 0) {
            const firstActive = json.data.stations.find((st: StationOptionItem) => st.status === "ACTIVE") || json.data.stations[0];
            const firstStId = String(firstActive.stationId);
            setSelectedStationId(firstStId);
            const matching = json.data.chargers.filter((c: ChargerOptionItem) => String(c.stationId) === firstStId && c.status !== "INACTIVE" && c.status !== "FAULTY");
            const firstCharger = matching[0] || json.data.chargers.find((c: ChargerOptionItem) => String(c.stationId) === firstStId);
            if (firstCharger) setSelectedChargerId(String(firstCharger.chargerId));
          }
          if (json.data.evs.length > 0) {
            setSelectedEvId(String(json.data.evs[0].evId));
          }
        }
      } catch {
        // ignore
      } finally {
        if (active) setIsLoadingOptions(false);
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const handleStationChange = (newStationId: string) => {
    setSelectedStationId(newStationId);
    const matching = options.chargers.filter(
      (c) => String(c.stationId) === newStationId && c.status !== "INACTIVE" && c.status !== "FAULTY"
    );
    const fallback = options.chargers.find((c) => String(c.stationId) === newStationId);
    setSelectedChargerId(matching[0] ? String(matching[0].chargerId) : fallback ? String(fallback.chargerId) : "");
  };

  // Handle Station Submit
  const handleStationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!window.confirm(`Confirm creating charging station '${stationName}'?`)) return;

    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/data/stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_name: stationName,
          location,
          total_capacity_kw: Number(totalCapacityKw),
          operating_status: operatingStatus,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status}`);
      }

      setSuccessMessage(json.data.message || "Charging station created successfully!");
      setStationName("");
      setLocation("");
      setTotalCapacityKw("100");
      fetchOptions();
      onSuccess();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Session Submit
  const handleSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChargerId) {
      setErrorMessage("Please select a valid charger.");
      return;
    }

    if (!window.confirm("Confirm recording this new charging session?")) return;

    setIsSubmitting(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/admin/data/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_id: Number(selectedStationId),
          charger_id: Number(selectedChargerId),
          ev_id: Number(selectedEvId),
          start_time: startTime,
          end_time: endTime ? endTime : null,
          energy_kwh: Number(energyKwh),
          peak_power_kw: peakPowerKw ? Number(peakPowerKw) : null,
          cost: Number(cost),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || `HTTP ${res.status}`);
      }

      setSuccessMessage(json.data.message || "Charging session recorded successfully!");
      onSuccess();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Tab toggle between station and session forms */}
      <div className="flex border-b border-rule">
        <button
          type="button"
          onClick={() => {
            setActiveForm("station");
            setSuccessMessage(null);
            setErrorMessage(null);
          }}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
            activeForm === "station"
              ? "border-charge text-charge font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          ➕ Add Charging Station
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveForm("session");
            setSuccessMessage(null);
            setErrorMessage(null);
          }}
          className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${
            activeForm === "session"
              ? "border-charge text-charge font-semibold"
              : "border-transparent text-muted hover:text-ink"
          }`}
        >
          ⚡ Record Charging Session
        </button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="rounded border border-emerald-300 bg-emerald-500/10 p-3 text-xs text-emerald-800 font-medium">
          ✓ {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded border border-rose-300 bg-rose-500/10 p-3 text-xs text-rose-800 font-medium">
          ✕ {errorMessage}
        </div>
      )}

      {/* Form 1: Add Station */}
      {activeForm === "station" && (
        <form onSubmit={handleStationSubmit} className="space-y-4 rounded border border-rule bg-panel p-5 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-ink">New Charging Station</h3>
            <p className="text-xs text-muted">
              Inserts an authoritative physical station entry into PostgreSQL table &apos;Charging_Station&apos;.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="st-name" className="block text-xs font-medium text-ink">
                Station Name *
              </label>
              <input
                id="st-name"
                type="text"
                required
                maxLength={100}
                placeholder="e.g. Indiranagar Fast Charging Hub"
                value={stationName}
                onChange={(e) => setStationName(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-muted/60 focus:border-charge focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="st-location" className="block text-xs font-medium text-ink">
                Location Address / Area *
              </label>
              <input
                id="st-location"
                type="text"
                required
                maxLength={150}
                placeholder="e.g. 100ft Road, Indiranagar, Bengaluru"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-muted/60 focus:border-charge focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="st-cap" className="block text-xs font-medium text-ink">
                Total Rated Capacity (kW) *
              </label>
              <input
                id="st-cap"
                type="number"
                required
                min={1}
                max={5000}
                step={0.5}
                value={totalCapacityKw}
                onChange={(e) => setTotalCapacityKw(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="st-status" className="block text-xs font-medium text-ink">
                Operating Status *
              </label>
              <select
                id="st-status"
                value={operatingStatus}
                onChange={(e) => setOperatingStatus(e.target.value as "ACTIVE" | "INACTIVE" | "MAINTENANCE")}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !stationName.trim() || !location.trim()}
              className="rounded bg-charge px-4 py-2 text-xs font-semibold text-white transition hover:bg-charge/90 disabled:opacity-50"
            >
              {isSubmitting ? "Creating Station..." : "Create Charging Station"}
            </button>
          </div>
        </form>
      )}

      {/* Form 2: Record Session */}
      {activeForm === "session" && (
        <form onSubmit={handleSessionSubmit} className="space-y-4 rounded border border-rule bg-panel p-5 shadow-sm">
          <div>
            <h3 className="text-sm font-semibold text-ink">New Charging Session</h3>
            <p className="text-xs text-muted">
              Inserts a verified charging event into PostgreSQL table &apos;Charging_Session&apos;.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="sess-st" className="block text-xs font-medium text-ink">
                Charging Station *
              </label>
              <select
                id="sess-st"
                value={selectedStationId}
                onChange={(e) => handleStationChange(e.target.value)}
                disabled={isLoadingOptions}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              >
                {options.stations.map((st) => {
                  const isInactive = st.status !== "ACTIVE";
                  return (
                    <option key={st.stationId} value={st.stationId} disabled={isInactive}>
                      #{st.stationId}: {st.stationName} ({st.totalCapacityKw} kW) {isInactive ? `[${st.status} - Inactive]` : ""}
                    </option>
                  );
                })}
              </select>
              {isStationInactive && (
                <p className="mt-1 text-[11px] font-medium text-rose-500">
                  ⚠️ This station is deactivated. New sessions cannot be created here.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="sess-charger" className="block text-xs font-medium text-ink">
                Installed Charger *
              </label>
              <select
                id="sess-charger"
                value={selectedChargerId}
                onChange={(e) => setSelectedChargerId(e.target.value)}
                disabled={availableChargers.length === 0 || isStationInactive}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              >
                {availableChargers.length === 0 ? (
                  <option value="">No chargers installed for this station</option>
                ) : (
                  availableChargers.map((ch) => {
                    const isUnavailable = ch.status === "INACTIVE" || ch.status === "FAULTY";
                    return (
                      <option key={ch.chargerId} value={ch.chargerId} disabled={isUnavailable}>
                        Charger #{ch.chargerId} ({ch.chargerType} · {ch.ratedPowerKw} kW) {isUnavailable ? `[${ch.status} - Unavailable]` : `(${ch.status})`}
                      </option>
                    );
                  })
                )}
              </select>
              {isChargerInactive && (
                <p className="mt-1 text-[11px] font-medium text-rose-500">
                  ⚠️ This charger is {currentCharger?.status}. Cannot record sessions on inactive/faulty chargers.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="sess-ev" className="block text-xs font-medium text-ink">
                Electric Vehicle (EV) *
              </label>
              <select
                id="sess-ev"
                value={selectedEvId}
                onChange={(e) => setSelectedEvId(e.target.value)}
                disabled={isLoadingOptions}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              >
                {options.evs.map((ev) => (
                  <option key={ev.evId} value={ev.evId}>
                    {ev.registrationNo} — {ev.model} ({ev.batteryCapacityKwh} kWh)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="sess-start" className="block text-xs font-medium text-ink">
                Start Timestamp *
              </label>
              <input
                id="sess-start"
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="sess-end" className="block text-xs font-medium text-ink">
                End Timestamp (Optional)
              </label>
              <input
                id="sess-end"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="sess-energy" className="block text-xs font-medium text-ink">
                Energy Consumed (kWh) *
              </label>
              <input
                id="sess-energy"
                type="number"
                required
                min={0}
                step={0.1}
                value={energyKwh}
                onChange={(e) => setEnergyKwh(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="sess-power" className="block text-xs font-medium text-ink">
                Peak Charging Power (kW)
              </label>
              <input
                id="sess-power"
                type="number"
                min={0}
                step={0.1}
                value={peakPowerKw}
                onChange={(e) => setPeakPowerKw(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="sess-cost" className="block text-xs font-medium text-ink">
                Billed Cost (₹) *
              </label>
              <input
                id="sess-cost"
                type="number"
                required
                min={0}
                step={1}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="mt-1 w-full rounded border border-rule bg-paper px-3 py-1.5 text-xs text-ink focus:border-charge focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !selectedChargerId || !startTime || isStationInactive || isChargerInactive}
              className="rounded bg-charge px-4 py-2 text-xs font-semibold text-white transition hover:bg-charge/90 disabled:opacity-50"
            >
              {isSubmitting ? "Recording Session..." : "Insert Charging Session"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
