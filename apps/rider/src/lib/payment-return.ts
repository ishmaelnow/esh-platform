const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type RiderPaymentReturn = { tenant: string; payment: "success" | "cancelled"; quote: string | null; occurrence: string | null };

export function readRiderPaymentReturn(raw: string, riderOrigin: string): RiderPaymentReturn | null {
  try {
    const url = new URL(raw);
    const origin = new URL(riderOrigin);
    const hosted = url.origin === origin.origin && ["/", "/payments/return"].includes(url.pathname);
    const native = url.protocol === "com.esh.rider:" && url.host === "auth" && url.pathname === "/callback";
    if ((!hosted && !native) || url.username || url.password || url.hash) return null;
    const tenant = url.searchParams.get("tenant"), payment = url.searchParams.get("payment");
    const quote = url.searchParams.get("quote"), occurrence = url.searchParams.get("occurrence");
    if (!tenant || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(tenant) || (payment !== "success" && payment !== "cancelled")
      || (payment === "success" && (!quote || !uuid.test(quote))) || (quote !== null && !uuid.test(quote))
      || (occurrence !== null && !uuid.test(occurrence))) return null;
    return { tenant, payment, quote, occurrence };
  } catch { return null; }
}

export function paymentReturnPath(value: RiderPaymentReturn) {
  const params = new URLSearchParams({ tenant: value.tenant, payment: value.payment });
  if (value.quote) params.set("quote", value.quote);
  if (value.occurrence) params.set("occurrence", value.occurrence);
  return `/?${params}`;
}

export function paymentAppReturnUrl(value: RiderPaymentReturn, android: boolean) {
  const callback = `auth/callback${paymentReturnPath(value).slice(1)}`;
  // Explicit package prevents another Android handler from claiming this callback.
  // Keep the manual link available: browsers may require a user gesture.
  return android
    ? `intent://${callback}#Intent;scheme=com.esh.rider;package=com.esh.rider;end`
    : `com.esh.rider://${callback}`;
}

export function checkoutReturnUrls(origin: string, tenant: string, quote: string, occurrence: string | undefined, native: boolean) {
  const success = new URL(native ? "/payments/return" : "/", origin);
  success.searchParams.set("tenant", tenant); success.searchParams.set("payment", "success"); success.searchParams.set("quote", quote);
  if (occurrence) success.searchParams.set("occurrence", occurrence);
  if (native) success.searchParams.set("returnTo", "app");
  const cancelled = new URL(success);
  cancelled.searchParams.set("payment", "cancelled");
  return { successUrl: success.toString(), cancelUrl: cancelled.toString() };
}
