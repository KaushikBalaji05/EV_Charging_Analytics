/** Next.js gives searchParams values as string | string[] | undefined. Keep the first value of any repeated key. */
export function flattenSearchParams(raw: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

/** Route Handlers: ?a=1&b=2 -> { a: "1", b: "2" } (a repeated key keeps its last value). */
export function queryParams(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

/** Zod issues -> short human messages for an inline "fix your filter" panel. */
export function describeIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string[] {
  return error.issues.map((i) => `${i.path.length ? i.path.map(String).join(".") : "filter"}: ${i.message}`);
}
