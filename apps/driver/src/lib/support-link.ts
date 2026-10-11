export type DriverSupportLink = { bookingId: string; caseId: string; tenantSlug: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function readDriverSupportTap(data: unknown): DriverSupportLink | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  return value.product === "driver" && value.notificationType === "driver_support_update"
    && typeof value.bookingId === "string" && uuid.test(value.bookingId)
    && typeof value.caseId === "string" && uuid.test(value.caseId)
    && typeof value.tenantSlug === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value.tenantSlug)
    ? { bookingId: value.bookingId, caseId: value.caseId, tenantSlug: value.tenantSlug } : null;
}
export function readDriverSupportLink(raw: string, origin: string): DriverSupportLink | null {
  try {
    const url = new URL(raw);
    if (url.origin !== origin || url.pathname !== "/" || url.searchParams.get("view") !== "recent") return null;
    return readDriverSupportTap({ product: "driver", notificationType: "driver_support_update",
      bookingId: url.searchParams.get("booking"), caseId: url.searchParams.get("support"), tenantSlug: url.searchParams.get("tenant") });
  } catch { return null; }
}


