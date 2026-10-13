export type RatingTarget = { bookingId: string; tenantSlug: string; intent?: "received" | "review" };
export function isRatingNotification(type: string) {
  return /^(rider|driver)_rating_(reminder|received|reviewed)$/.test(type);
}
export function ratingTarget(value: Record<string, unknown>): RatingTarget | null {
  const bookingId = value.booking_id ?? value.bookingId;
  const tenantSlug = value.tenant_slug ?? value.tenantSlug;
  const intent = value.intent ?? (typeof value.notificationType === "string"
    ? value.notificationType.endsWith("_rating_received") ? "received"
      : value.notificationType.endsWith("_rating_reviewed") ? "review" : undefined : undefined);
  return (intent === undefined || intent === "received" || intent === "review")
    && typeof bookingId === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(bookingId)
    && typeof tenantSlug === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(tenantSlug)
    ? { bookingId, tenantSlug, ...(intent ? { intent } : {}) } : null;
}
export function readRatingTap(value: unknown, product: "rider" | "driver") {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  return row.product === product && typeof row.notificationType === "string"
    && row.notificationType.startsWith(`${product}_`) && isRatingNotification(row.notificationType) ? ratingTarget(row) : null;
}
export function readRatingLink(raw: string, origin: string) {
  try {
    const url = new URL(raw);
    return url.origin === origin && url.pathname === "/" && url.searchParams.get("view") === "ratings"
      ? ratingTarget({ booking_id: url.searchParams.get("booking"), tenant_slug: url.searchParams.get("tenant"),
        intent: url.searchParams.get("rating") ?? undefined }) : null;
  } catch { return null; }
}
export function ratingUrl(base: string, payload: Record<string, unknown>) {
  const url = new URL("/", base);
  url.searchParams.set("view", "ratings");
  const target = ratingTarget(payload);
  if (target) { url.searchParams.set("booking", target.bookingId); url.searchParams.set("tenant", target.tenantSlug);
    if (target.intent) url.searchParams.set("rating", target.intent); }
  return url.toString();
}
