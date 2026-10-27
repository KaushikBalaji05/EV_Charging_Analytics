import { handleAuthed, ok } from "@/lib/api/response";
import { rankStations } from "@/lib/db/queries/stations";
import { queryParams } from "@/lib/validation/params";
import { RankingQuerySchema } from "@/lib/validation/listing";

/**
 * GET /api/stations/ranking?metric=energy&limit=10&from=&to=   (Analyst+)
 * metric: energy | sessions | revenue | utilization | overloads. Ranks use SQL RANK(): ties share a rank.
 * 200 -> [{ rank, stationId, stationName, metric, metricValue, ... }] | 400 invalid metric | 401 | 503
 */
export async function GET(request: Request) {
  return handleAuthed(request, "ANALYST", async () => ok(await rankStations(RankingQuerySchema.parse(queryParams(request)))));
}
