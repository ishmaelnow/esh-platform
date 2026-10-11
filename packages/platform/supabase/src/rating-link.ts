export type RatingTarget = { bookingId: string; tenantSlug: string };
export function ratingTarget(value: Record<string, unknown>): RatingTarget | null {
  const bookingId = value.booking_id ?? value.bookingId;
  const tenantSlug = value.tenant_slug ?? value.tenantSlug;
  return typeof bookingId === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(bookingId)
    && typeof tenantSlug === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(tenantSlug)
    ? { bookingId, tenantSlug } : null;
}
export function readRatingTap(value: unknown, product: "rider" | "driver") {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return row.product === product && row.notificationType === `${product}_rating_reminder` ? ratingTarget(row) : null;
}
export function readRatingLink(raw: string, origin: string) {
  try {
    const url = new URL(raw);
    return url.origin === origin && url.pathname === "/" && url.searchParams.get("view") === "ratings"
      ? ratingTarget({ booking_id: url.searchParams.get("booking"), tenant_slug: url.searchParams.get("tenant") }) : null;
  } catch { return null; }
}
export function ratingUrl(base: string, payload: Record<string, unknown>) {
  const url = new URL("/", base);
  url.searchParams.set("view", "ratings");
  const target = ratingTarget(payload);
  if (target) { url.searchParams.set("booking", target.bookingId); url.searchParams.set("tenant", target.tenantSlug); }
  return url.toString();
}
