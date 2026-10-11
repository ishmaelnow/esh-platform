export type SupportLink = { bookingId: string; caseId: string; tenantSlug: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readSupportTap(data: unknown): SupportLink | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  return value.product === "rider" && value.notificationType === "rider_support_update"
    && typeof value.bookingId === "string" && uuid.test(value.bookingId)
    && typeof value.caseId === "string" && uuid.test(value.caseId)
    && typeof value.tenantSlug === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value.tenantSlug)
    ? { bookingId: value.bookingId, caseId: value.caseId, tenantSlug: value.tenantSlug } : null;
}
export function readSupportLink(raw: string, origin: string): SupportLink | null {
  try {
    const url = new URL(raw);
    if (url.origin !== origin || url.pathname !== "/" || url.searchParams.get("view") !== "trips") return null;
    return readSupportTap({ product: "rider", notificationType: "rider_support_update",
      bookingId: url.searchParams.get("booking"), caseId: url.searchParams.get("support"), tenantSlug: url.searchParams.get("tenant") });
  } catch { return null; }
}
