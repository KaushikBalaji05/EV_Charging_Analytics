import "server-only";

/** Standard result shape for paginated lists. */
export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function paged<T>(rows: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { rows, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

export const offsetFor = (page: number, pageSize: number) => (page - 1) * pageSize;

/**
 * Turns user search text into an ILIKE pattern. % _ and \ are escaped so they match literally
 * (PostgreSQL's default LIKE escape character is backslash). Blank text means "no search".
 */
export function likePattern(text?: string): string | null {
  const t = text?.trim();
  return t ? `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
}

/**
 * Date-range predicate on a timestamp column. $fromN / $toN are positional parameters holding
 * 'YYYY-MM-DD' or NULL. 'to' includes the whole day. The column name is always a literal from our code.
 */
export function rangeClause(column: string, fromParam: number, toParam: number): string {
  return `($${fromParam}::date IS NULL OR ${column} >= $${fromParam}::date)
      AND ($${toParam}::date IS NULL OR ${column} <  $${toParam}::date + 1)`;
}

/** ORDER direction is picked from our own constants, never concatenated from input. */
export const dir = (order: "asc" | "desc") => (order === "asc" ? "ASC" : "DESC");
