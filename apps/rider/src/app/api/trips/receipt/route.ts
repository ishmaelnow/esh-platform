import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";
import { quoteBreakdown, safeStripeReceipt, type TripReceipt } from "../../../../lib/trip-receipt";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ message: "Sign in to view your receipt." }, { status: 401, headers });
  const params = new URL(request.url).searchParams, bookingId = params.get("bookingId"), tenantSlug = params.get("tenantSlug");
  if (!bookingId || !uuid.test(bookingId) || !tenantSlug || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(tenantSlug))
    return NextResponse.json({ message: "Choose a trip to view its receipt." }, { status: 400, headers });
  try {
    // All reads use the caller's JWT and existing RLS. Never use a service-role fallback.
    const client = createAuthenticatedSupabaseClient(authorization.slice(7));
    const portalResult = await client.rpc("my_rider_portal", { target_tenant_slug: tenantSlug });
    const portal = portalResult.data as unknown as { tenant?: { tenantId?: string; displayName?: string }; profile?: { riderProfileId?: string; status?: string } } | null;
    if (portalResult.error || !portal?.tenant?.tenantId || !portal.profile?.riderProfileId || portal.profile.status !== "active") throw new Error("Unavailable");
    const tenantId = portal.tenant.tenantId, riderId = portal.profile.riderProfileId;
    const bookingResult = await client.from("dispatch_bookings")
      .select("booking_id,tenant_id,rider_profile_id,status,pickup_address,destination_address,created_at,completed_at,price_quote_id,fare_currency_code,estimated_fare_minor,final_fare_minor")
      .eq("booking_id", bookingId).eq("tenant_id", tenantId).eq("rider_profile_id", riderId).single();
    const b = bookingResult.data;
    if (bookingResult.error || !b || b.tenant_id !== tenantId || b.rider_profile_id !== riderId || !["completed", "cancelled"].includes(b.status)) throw new Error("Unavailable");
    const [quote, payments, refunds, wallet, settlements, disputes, review] = await Promise.all([
      b.price_quote_id ? client.from("trip_price_quotes").select("fare_amount_minor,currency_code,pricing_snapshot,route_distance_meters,route_duration_seconds,fare_policy")
        .eq("quote_id", b.price_quote_id).eq("tenant_id", tenantId).eq("rider_profile_id", riderId).eq("booking_id", bookingId).single() : Promise.resolve({ data: null, error: null }),
      client.from("rider_payment_attempts").select("payment_attempt_id,amount_minor,currency_code,status,paid_at,created_at,provider,provider_payment_intent_id")
        .eq("tenant_id", tenantId).eq("rider_profile_id", riderId).eq("booking_id", bookingId).order("created_at"),
      client.from("rider_payment_refunds").select("amount_minor,currency_code,status,refunded_at").eq("tenant_id", tenantId).eq("booking_id", bookingId),
      client.from("rider_wallet_quote_allocations").select("amount_minor,currency_code,status,restored_at")
        .eq("tenant_id", tenantId).eq("rider_profile_id", riderId).eq("booking_id", bookingId).maybeSingle(),
      client.from("trip_fare_settlements").select("amount_minor,currency_code,direction,status").eq("tenant_id", tenantId).eq("booking_id", bookingId),
      client.from("rider_payment_disputes").select("amount_minor,currency_code,status").eq("tenant_id", tenantId).eq("booking_id", bookingId),
      client.from("trip_fare_reconciliations").select("status,calculated_fare_minor,currency_code").eq("tenant_id", tenantId).eq("booking_id", bookingId).maybeSingle(),
    ]);
    if ([quote, payments, refunds, wallet, settlements, disputes, review].some((result) => result.error)) throw new Error("Unavailable");
    const q = quote.data;
    if (q && q.currency_code !== b.fare_currency_code) throw new Error("Unavailable");
    const receipt: TripReceipt = { bookingId, company: portal.tenant.displayName ?? "Transportation company", status: b.status,
      createdAt: b.created_at, completedAt: b.completed_at, pickup: b.pickup_address, destination: b.destination_address,
      currency: b.fare_currency_code, fareMinor: b.final_fare_minor ?? b.estimated_fare_minor,
      quotedFareMinor: q?.fare_amount_minor ?? null, farePolicy: q?.fare_policy ?? null,
      breakdown: q && q.currency_code === b.fare_currency_code ? quoteBreakdown(q.pricing_snapshot, q.route_distance_meters, q.route_duration_seconds, q.fare_amount_minor) : [],
      payments: await Promise.all((payments.data ?? []).map(async (payment) => {
        let method = "Payment method unavailable", receiptUrl: string | null = null;
        if (payment.provider === "stripe" && payment.provider_payment_intent_id && ["paid", "refunded"].includes(payment.status)) {
          try {
            const intent = await createStripeClient().paymentIntents.retrieve(payment.provider_payment_intent_id, { expand: ["latest_charge"] }, { timeout: 5000, maxNetworkRetries: 0 });
            const charge = typeof intent.latest_charge === "string" ? null : intent.latest_charge;
            const details = charge?.payment_method_details;
            method = details?.card?.last4 ? `${(details.card.brand ?? "card").toUpperCase()} ending in ${details.card.last4}`
              : details?.type ? details.type.replaceAll("_", " ") : method;
            receiptUrl = safeStripeReceipt(charge?.receipt_url);
          } catch { /* Recorded database activity remains available during a processor outage. */ }
        }
        return { id: payment.payment_attempt_id, amountMinor: payment.amount_minor, currency: payment.currency_code,
          status: payment.status, date: payment.paid_at ?? payment.created_at, method, receiptUrl };
      })),
      refunds: (refunds.data ?? []).map((r) => ({ amountMinor: r.amount_minor, currency: r.currency_code, status: r.status, date: r.refunded_at })),
      wallet: wallet.data ? { amountMinor: wallet.data.amount_minor, currency: wallet.data.currency_code, status: wallet.data.status, restoredAt: wallet.data.restored_at } : null,
      settlements: (settlements.data ?? []).map((s) => ({ amountMinor: s.amount_minor, currency: s.currency_code, direction: s.direction, status: s.status })),
      disputes: (disputes.data ?? []).map((d) => ({ amountMinor: d.amount_minor, currency: d.currency_code, status: d.status })),
      review: review.data ? { status: review.data.status, contractFareMinor: review.data.calculated_fare_minor, currency: review.data.currency_code } : null,
    };
    return NextResponse.json(receipt, { headers });
  } catch {
    return NextResponse.json({ message: "Your trip receipt could not be loaded. Check your connection and try again." }, { status: 400, headers });
  }
}
