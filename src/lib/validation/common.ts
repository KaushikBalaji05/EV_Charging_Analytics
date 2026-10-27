import { z } from "zod";
import { APP_CONFIG } from "@/lib/config";

const MS_PER_DAY = 86_400_000;

function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // rejects 2026-02-31
}

/** Blank form fields arrive as "" and mean "no filter". */
export const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const dateOnly = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use the format YYYY-MM-DD", abort: true })
    .refine(isRealDate, "Not a real calendar date")
    .optional(),
);

/** The two optional date fields shared by every filterable endpoint. */
export const DateRangeShape = { from: dateOnly, to: dateOnly };

/** When both bounds are present: from <= to and the span is capped. Reused by every range-filtered schema. */
export function checkDateRange(
  v: { from?: string; to?: string },
  ctx: { addIssue: (issue: { code: "custom"; path: string[]; message: string }) => void },
): void {
  if (v.from && v.to) {
    if (v.from > v.to) {
      ctx.addIssue({ code: "custom", path: ["from"], message: "'from' must be on or before 'to'" });
      return;
    }
    const days = (Date.parse(v.to) - Date.parse(v.from)) / MS_PER_DAY + 1;
    if (days > APP_CONFIG.maxRangeDays) {
      ctx.addIssue({ code: "custom", path: ["to"], message: `Range cannot exceed ${APP_CONFIG.maxRangeDays} days` });
    }
  }
}

/** Inclusive date range. Both bounds optional. */
export const DateRangeSchema = z.object(DateRangeShape).superRefine(checkDateRange);

export type DateRange = z.infer<typeof DateRangeSchema>;

/** Positive integer id such as ?station_id=3 or a [id] route segment. */
export const positiveInt = z.coerce
  .number()
  .int("Must be a whole number")
  .positive("Must be greater than zero")
  .max(2_147_483_647, "Out of range");

export const optionalStationId = z.preprocess(emptyToUndefined, positiveInt.optional());
