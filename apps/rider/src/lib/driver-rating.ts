export function driverRatingLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "Rating unavailable";
  const row = value as Record<string, unknown>;
  if (typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0) return "Rating unavailable";
  if (row.count === 0) return row.average === null ? "Not yet rated" : "Rating unavailable";
  if (typeof row.average !== "number" || !Number.isFinite(row.average) || row.average < 1 || row.average > 5)
    return "Rating unavailable";
  return `★ ${row.average.toFixed(2)} · ${row.count.toLocaleString()} ${row.count === 1 ? "rating" : "ratings"}`;
}
