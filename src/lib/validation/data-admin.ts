import { z } from "zod";

export const CreateStationSchema = z.object({
  station_name: z
    .string()
    .trim()
    .min(1, "Station name is required")
    .max(100, "Station name cannot exceed 100 characters"),
  location: z
    .string()
    .trim()
    .min(1, "Location is required")
    .max(150, "Location cannot exceed 150 characters"),
  total_capacity_kw: z
    .coerce
    .number()
    .positive("Total capacity must be greater than 0 kW")
    .max(10000, "Total capacity cannot exceed 10,000 kW"),
  operating_status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"], {
    message: "Operating status must be ACTIVE, INACTIVE, or MAINTENANCE",
  }),
});

export const CreateSessionSchema = z
  .object({
    station_id: z.coerce.number().int().positive("Please select a valid charging station"),
    charger_id: z.coerce.number().int().positive("Please select a valid charger"),
    ev_id: z.coerce.number().int().positive("Please select a valid electric vehicle"),
    start_time: z
      .string()
      .min(1, "Start time is required")
      .refine((val) => !isNaN(Date.parse(val)), { message: "Invalid start timestamp" }),
    end_time: z
      .string()
      .optional()
      .nullable()
      .refine((val) => !val || !isNaN(Date.parse(val)), { message: "Invalid end timestamp" }),
    energy_kwh: z
      .coerce
      .number()
      .min(0, "Energy consumed must be non-negative")
      .max(1000, "Energy consumed cannot exceed 1,000 kWh"),
    peak_power_kw: z
      .coerce
      .number()
      .min(0, "Peak power must be non-negative")
      .max(1000, "Peak power cannot exceed 1,000 kW")
      .optional()
      .nullable(),
    cost: z
      .coerce
      .number()
      .min(0, "Cost must be non-negative")
      .max(100000, "Cost cannot exceed ₹1,00,000"),
  })
  .refine(
    (data) => {
      if (data.end_time && data.start_time) {
        return new Date(data.end_time) >= new Date(data.start_time);
      }
      return true;
    },
    {
      message: "End time cannot be earlier than start time",
      path: ["end_time"],
    }
  );

export const UpdateStationStatusSchema = z
  .object({
    action: z.enum(["deactivate", "reactivate", "set_status"]).optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE"]).optional(),
  })
  .refine(
    (data) => Boolean(data.action || data.status),
    { message: "Either action ('deactivate' | 'reactivate') or status must be provided" }
  )
  .transform((data) => {
    if (data.action === "deactivate") return { status: "INACTIVE" as const, action: "deactivate" as const };
    if (data.action === "reactivate") return { status: "ACTIVE" as const, action: "reactivate" as const };
    const status = data.status!;
    const action = status === "ACTIVE" ? ("reactivate" as const) : ("deactivate" as const);
    return { status, action };
  });

export const UpdateChargerStatusSchema = z
  .object({
    action: z.enum(["deactivate", "reactivate", "set_status"]).optional(),
    status: z.enum(["AVAILABLE", "IN_USE", "FAULTY", "INACTIVE"]).optional(),
  })
  .refine(
    (data) => Boolean(data.action || data.status),
    { message: "Either action ('deactivate' | 'reactivate') or status must be provided" }
  )
  .transform((data) => {
    if (data.action === "deactivate") return { status: "INACTIVE" as const, action: "deactivate" as const };
    if (data.action === "reactivate") return { status: "AVAILABLE" as const, action: "reactivate" as const };
    const status = data.status!;
    const action = status === "INACTIVE" ? ("deactivate" as const) : ("reactivate" as const);
    return { status, action };
  });

export const EntityIdParamSchema = z.coerce
  .number()
  .int("Entity ID must be an integer")
  .positive("Entity ID must be positive");

