import { APP_CONFIG } from "@/lib/config";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const inr = new Intl.NumberFormat(APP_CONFIG.locale, { style: "currency", currency: APP_CONFIG.currency });
const num1 = new Intl.NumberFormat(APP_CONFIG.locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const num0 = new Intl.NumberFormat(APP_CONFIG.locale, { maximumFractionDigits: 0 });

export const formatInr = (v: number) => inr.format(v);
export const formatKwh = (v: number) => `${num1.format(v)} kWh`;
export const formatKw = (v: number | null) => (v == null ? "—" : `${num1.format(v)} kW`);
export const formatPct = (v: number | null) => (v == null ? "—" : `${num1.format(v)}%`);
export const formatInt = (v: number) => num0.format(v);

/**
 * Formats a stored 'YYYY-MM-DD HH:MM:SS' timestamp WITHOUT creating a Date,
 * so no time-zone conversion can shift it. Output: "20 Oct 2026, 10:00".
 */
export function formatTimestamp(ts: string | null): string {
  if (!ts) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(ts);
  if (!m) return ts;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}, ${m[4]}:${m[5]}`;
}

export const formatHourRange = (h: number) =>
  `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;

const instant = new Intl.DateTimeFormat(APP_CONFIG.locale, {
  timeZone: "Asia/Kolkata",
  dateStyle: "medium",
  timeStyle: "short",
});

/** For TIMESTAMPTZ values (login times etc.): an exact instant, displayed in IST. */
export const formatInstant = (d: Date | string | null) => (d ? `${instant.format(new Date(d))} IST` : "Never");

/** Compact stamp for chart axes: "20 Oct 10:00". Never builds a Date, so no time-zone shift. */
export function formatShortTimestamp(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(ts);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[4]}:${m[5]}` : ts;
}

/** "2026-10-20" -> "20 Oct 2026" (a calendar day has no time zone to convert). */
export function formatDay(d: string | null): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})/.exec(d) : null;
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "—";
}

/** 135 -> "2 h 15 min". Null (ongoing session) -> "—". */
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
