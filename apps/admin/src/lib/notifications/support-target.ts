const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function supportTarget(payload: Record<string, unknown>) {
  const bookingId = payload.booking_id ?? payload.bookingId;
  const caseId = payload.case_id ?? payload.caseId;
  return typeof bookingId === "string" && uuid.test(bookingId) && typeof caseId === "string" && uuid.test(caseId)
    ? { bookingId, caseId } : null;
}
export function supportUrl(base: string, payload: Record<string, unknown>, view: "trips" | "recent" = "trips") {
  const url = new URL("/", base);
  if (typeof payload.tenant_slug === "string") url.searchParams.set("tenant", payload.tenant_slug);
  url.searchParams.set("view", view);
  const target = supportTarget(payload);
  if (target) { url.searchParams.set("booking", target.bookingId); url.searchParams.set("support", target.caseId); }
  return url.toString();
}
