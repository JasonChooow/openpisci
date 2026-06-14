/**
 * Parse API / DB timestamps as UTC milliseconds.
 *
 * Backend stores `DateTime<Utc>` (RFC3339). Strings without an explicit
 * timezone must be treated as UTC — bare `Date.parse` interprets them as
 * local time, which skews relative times by the user's UTC offset (e.g. +8h
 * in China).
 */
export function parseUtcTimestamp(iso: string | number | null | undefined): number {
  if (iso == null) return 0;
  if (typeof iso === "number" && Number.isFinite(iso)) return iso;

  const raw = String(iso).trim();
  if (!raw) return 0;

  let dateStr = raw;

  if (!/[Zz]$/.test(dateStr) && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(dateStr)) {
      dateStr = `${dateStr.replace(" ", "T")}Z`;
    } else {
      dateStr = `${dateStr}Z`;
    }
  }

  const ts = Date.parse(dateStr);
  return Number.isFinite(ts) ? ts : 0;
}

/** Normalize a timestamp field to a UTC ISO string for Redux storage. */
export function toUtcIsoString(iso: string | number | null | undefined): string | undefined {
  const ts = parseUtcTimestamp(iso);
  return ts ? new Date(ts).toISOString() : undefined;
}

/** Normalize session timestamp fields after Tauri IPC. */
export function normalizeSession<T extends { created_at?: string; updated_at?: string }>(session: T): T {
  const created = toUtcIsoString(session.created_at);
  const updated = toUtcIsoString(session.updated_at ?? session.created_at);
  return {
    ...session,
    ...(created ? { created_at: created } : {}),
    ...(updated ? { updated_at: updated } : {}),
  };
}
