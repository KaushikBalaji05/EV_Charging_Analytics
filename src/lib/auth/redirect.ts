/** Only same-site relative paths may be used as a post-login destination (prevents open redirects). */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw || raw.length > 300) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  if (raw.startsWith("/login") || raw.startsWith("/api")) return fallback;
  return raw;
}
