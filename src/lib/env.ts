import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set"),
  DATABASE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DATA_MODE: z.enum(["demo", "production"]).default("demo"),
  // Session cookie "Secure" flag. Unset = on in production, off in development.
  // Set to "false" only to test a production build over plain http://localhost.
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017"),
  MONGODB_DB_NAME: z.string().default("ev_charging_analytics"),
  OPEN_CHARGE_MAP_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parsed lazily so that a missing variable surfaces as a handled error, not a crash at import. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Log which variables are wrong, never their values.
    console.error(
      "[env] invalid configuration:",
      parsed.error.issues.map((i) => i.path.join(".")).join(", "),
    );
    throw new ConfigError();
  }
  cached = parsed.data;
  return cached;
}

export class ConfigError extends Error {
  constructor() {
    super("Server configuration is incomplete");
    this.name = "ConfigError";
  }
}
