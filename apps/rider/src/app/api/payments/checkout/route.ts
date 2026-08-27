import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

export async function POST(request: Request) {
  let claimedOccurrenceId: string | null = null;
  let claimedQuoteId: string | null = null;
  let providerSessionCreated = false;
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const { quoteId, tenantSlug, occurrenceId, bookingNotes, serviceType, scheduledPickupAt } = await request.json() as { quoteId?: string; tenantSlug?: string; occurrenceId?: string; bookingNotes?: string; serviceType?: string; scheduledPickupAt?: string };
    if (!quoteId || !tenantSlug) throw new Error("Price quote and tenant are required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const quoteResult = await authenticated.from("trip_price_quotes")
      .select("quote_id,tenant_id,service_area_id,fare_amount_minor,currency_code,pickup_address,destination_address,status,expires_at")
      .eq("quote_id", quoteId).single();
    if (quoteResult.error || !quoteResult.data) throw new Error("Price quote is unavailable.");
    const quote = quoteResult.data;
    if (quote.status !== "quoted" || Date.parse(quote.expires_at) <= Date.now()) throw new Error("Price quote has expired.");
    if (occurrenceId) {
      const occurrence = await authenticated.from("rider_booking_series_occurrences")
        .select("rider_booking_series_occurrence_id,rider_booking_series_id,status,scheduled_pickup_at").eq("rider_booking_series_occurrence_id", occurrenceId).single();
      if (occurrence.error || occurrence.data?.status !== "awaiting_payment")
        throw new Error("Recurring trip occurrence is unavailable.");
      const series = await authenticated.from("rider_booking_series")
        .select("service_area_id,pickup_address,destination_address,status")
        .eq("rider_booking_series_id", occurrence.data.rider_booking_series_id).single();
      if (series.error || series.data.status !== "active" || series.data.service_area_id !== quote.service_area_id
        || series.data.pickup_address !== quote.pickup_address || series.data.destination_address !== quote.destination_address)
        throw new Error("Fare quote does not match this recurring trip.");
      const scheduling = await authenticated.rpc("my_rider_scheduling", { target_tenant_slug: tenantSlug });
      const minimumNoticeMinutes = (scheduling.data as unknown as { settings?: { minimumNoticeMinutes?: number } })?.settings?.minimumNoticeMinutes ?? 60;
      if (Date.parse(occurrence.data.scheduled_pickup_at) < Date.now() + minimumNoticeMinutes * 60_000)
        throw new Error("This recurring trip is too close to pickup for payment. Skip it or choose another occurrence.");
    }
    const service = createServiceSupabaseClient();
    if (occurrenceId) {
      const claimed = await service.rpc("claim_recurring_occurrence_checkout_internal", {
        target_occurrence_id: occurrenceId, target_quote_id: quote.quote_id,
      });
      if (claimed.error) throw claimed.error;
      claimedOccurrenceId = occurrenceId; claimedQuoteId = quote.quote_id;
    }
    const walletResult = await service.rpc("prepare_rider_wallet_checkout_internal", {
      target_quote_id: quote.quote_id,
    });
    if (walletResult.error || !walletResult.data) throw walletResult.error ?? new Error("Wallet credit could not be prepared.");
    const split = walletResult.data as unknown as { walletAmountMinor: number; cardAmountMinor: number };
    if (split.cardAmountMinor === 0) {
      if (!occurrenceId) {
        const booked = await authenticated.rpc("create_my_rider_priced_booking_with_service_type", {
          target_quote_id: quote.quote_id,
          booking_notes_value: typeof bookingNotes === "string" ? bookingNotes.slice(0, 500) : "",
          service_type_value: typeof serviceType === "string" ? serviceType : "standard",
          scheduled_pickup_at_value: typeof scheduledPickupAt === "string" ? scheduledPickupAt : null,
        });
        if (booked.error || !booked.data) throw booked.error ?? new Error("Wallet booking could not be created.");
        return NextResponse.json({ walletOnly: true, booked: true, bookingId: booked.data, walletAmountMinor: split.walletAmountMinor });
      }
      return NextResponse.json({ walletOnly: true, walletAmountMinor: split.walletAmountMinor });
    }
    const origin = new URL(request.url).origin;
    const stripe = createStripeClient();
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_creation: "always",
      line_items: [{ price_data: { currency: quote.currency_code.toLowerCase(), unit_amount: split.cardAmountMinor,
        product_data: { name: "ESH trip", description: `${quote.pickup_address} to ${quote.destination_address}` } }, quantity: 1 }],
      success_url: `${origin}/?tenant=${encodeURIComponent(tenantSlug)}&payment=success&quote=${quote.quote_id}${occurrenceId ? `&occurrence=${encodeURIComponent(occurrenceId)}` : ""}`,
      cancel_url: `${origin}/?tenant=${encodeURIComponent(tenantSlug)}&payment=cancelled`,
      metadata: { quote_id: quote.quote_id, tenant_id: quote.tenant_id,
        occurrence_id: occurrenceId ?? "",
        wallet_amount_minor: String(split.walletAmountMinor), booking_notes: typeof bookingNotes === "string" ? bookingNotes.slice(0, 500) : "",
        service_type: typeof serviceType === "string" ? serviceType : "standard", scheduled_pickup_at: typeof scheduledPickupAt === "string" ? scheduledPickupAt : "" },
      payment_intent_data: { setup_future_usage: "off_session" },
    }, { idempotencyKey: `rider_quote_${quote.quote_id}` });
    providerSessionCreated = true;
    if (!checkout.url) throw new Error("Payment checkout is unavailable.");
    const registered = await service.rpc("register_rider_checkout_internal", {
      target_quote_id: quote.quote_id, checkout_session_id_value: checkout.id,
    });
    if (registered.error) throw registered.error;
    return NextResponse.json({ url: checkout.url, walletAmountMinor: split.walletAmountMinor,
      cardAmountMinor: split.cardAmountMinor });
  } catch (error) {
    if (claimedOccurrenceId && claimedQuoteId && !providerSessionCreated) {
      await createServiceSupabaseClient().rpc("release_recurring_occurrence_checkout_internal", {
        target_occurrence_id: claimedOccurrenceId, target_quote_id: claimedQuoteId,
      });
    }
    return NextResponse.json({ message: error instanceof Error ? error.message : "Checkout could not be created." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const searchParams = new URL(request.url).searchParams;
    const quoteId = searchParams.get("quote");
    if (!quoteId) throw new Error("Price quote is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const [quoteResult, paymentResult, walletResult] = await Promise.all([
      authenticated.from("trip_price_quotes").select("quote_id,service_area_id,fare_amount_minor,fare_policy,maximum_fare_minor,currency_code,pickup_address,destination_address,route_distance_meters,route_duration_seconds,expires_at,status,booking_id").eq("quote_id", quoteId).single(),
      authenticated.from("rider_payment_attempts").select("status").eq("quote_id", quoteId).single(),
      authenticated.from("rider_wallet_quote_allocations").select("amount_minor,status").eq("quote_id", quoteId).maybeSingle(),
    ]);
    if (quoteResult.error || !quoteResult.data) throw new Error("Price quote is unavailable.");
    const walletCoversFare = walletResult.data?.status === "reserved"
      && walletResult.data.amount_minor === quoteResult.data.fare_amount_minor;
    if ((paymentResult.error || !paymentResult.data) && !walletCoversFare) throw new Error("Payment status is unavailable.");
    return NextResponse.json({
      paymentStatus: walletCoversFare ? "paid" : paymentResult.data?.status,
      quote: {
        quoteId: quoteResult.data.quote_id, serviceAreaId: quoteResult.data.service_area_id,
        fareAmountMinor: quoteResult.data.fare_amount_minor,
        farePolicy: quoteResult.data.fare_policy, maximumFareMinor: quoteResult.data.maximum_fare_minor,
        currencyCode: quoteResult.data.currency_code, pickupAddress: quoteResult.data.pickup_address,
        destinationAddress: quoteResult.data.destination_address,
        routeDistanceMeters: quoteResult.data.route_distance_meters,
        routeDurationSeconds: quoteResult.data.route_duration_seconds,
        expiresAt: quoteResult.data.expires_at, bookingId: quoteResult.data.booking_id,
      },
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Payment status could not be loaded." }, { status: 400 });
  }
}
