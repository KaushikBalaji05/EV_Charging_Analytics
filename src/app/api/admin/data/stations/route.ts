import { handleAuthed, ok } from "@/lib/api/response";
import { insertChargingStation } from "@/lib/db/queries/data-admin";
import { CreateStationSchema } from "@/lib/validation/data-admin";

/**
 * POST /api/admin/data/stations
 * Protected (ADMIN only)
 * Creates a new charging station record in PostgreSQL Charging_Station.
 */
export async function POST(request: Request) {
  return handleAuthed(request, "ADMIN", async () => {
    const body = await request.json();
    const validated = CreateStationSchema.parse(body);

    const result = await insertChargingStation(validated);

    return ok({
      message: `Charging station '${validated.station_name}' created successfully.`,
      stationId: result.stationId,
    });
  });
}
