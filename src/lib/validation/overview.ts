import { DateRangeSchema } from "@/lib/validation/common";

/** GET /api/overview?from=YYYY-MM-DD&to=YYYY-MM-DD  (both optional) */
export const OverviewQuerySchema = DateRangeSchema;
export type OverviewQuery = ReturnType<typeof OverviewQuerySchema.parse>;
