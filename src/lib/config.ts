// Display and unit conventions shared across the app. Not secret; safe anywhere.
export const APP_CONFIG = {
  currency: "INR",
  locale: "en-IN",
  // Database columns are TIMESTAMP (no time zone). We treat stored values as
  // local wall-clock time in this zone and never convert them.
  timezoneLabel: "IST (Asia/Kolkata), as stored",
  maxRangeDays: 366,
} as const;

export const AUTH = {
  sessionHours: 8,
  maxFailedLogins: 5,
  lockMinutes: 15,
  minPasswordLength: 12,
  maxPasswordLength: 128,
} as const;
