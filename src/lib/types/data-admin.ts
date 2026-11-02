// Shared types and allowlists for Data Administration (Client & Server safe)

export const ALLOWED_PG_TABLES = [
  "charging_station",
  "charger",
  "ev",
  "charging_session",
  "grid_telemetry",
  "station_capacity",
  "v_overload_events",
  "v_session_details",
  "v_station_latest_capacity",
] as const;

export type AllowedPgTable = typeof ALLOWED_PG_TABLES[number];

export const ALLOWED_MONGO_COLLECTIONS = [
  "grid_telemetry",
] as const;

export type AllowedMongoCollection = typeof ALLOWED_MONGO_COLLECTIONS[number];

export interface DatabaseStatus {
  name: string;
  type: "postgresql" | "mongodb";
  status: "connected" | "disconnected" | "error";
  latencyMs: number | null;
  lastChecked: string;
  error?: string;
  stats: Record<string, unknown>;
}

export interface SimulatorInfo {
  status: "running" | "stopped";
  pid: number | null;
  configuredIntervalMs: number;
  simulatedStations: number[];
  latestTelemetryAt: string | null;
  recentLogs: string[];
}

export interface TableColumnMetadata {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface TableRecordsResult {
  table: string;
  columns: TableColumnMetadata[];
  rows: Record<string, unknown>[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MongoRecordsResult {
  collection: string;
  documents: Record<string, unknown>[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LiveTelemetrySummary {
  stationId: number;
  stationName: string;
  recordedAt: string;
  voltageV: number;
  currentA: number;
  powerKw: number;
  frequencyHz: number;
  gridLoadKw: number;
  source: string;
  isOverloaded: boolean;
  capacityKw: number;
}

export interface LiveTelemetryTrendPoint {
  recordedAt: string;
  stationId: number;
  powerKw: number;
  gridLoadKw: number;
  voltageV: number;
}

export interface StationOptionItem {
  stationId: number;
  stationName: string;
  totalCapacityKw: number;
  status: string;
}

export interface ChargerOptionItem {
  chargerId: number;
  stationId: number;
  chargerType: string;
  ratedPowerKw: number;
  status: string;
}

export interface EvOptionItem {
  evId: number;
  registrationNo: string;
  model: string;
  batteryCapacityKwh: number;
}
