import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const { quoteId, tenantSlug } = await request.json() as { quoteId?: string; tenantSlug?: string };
    if (!quoteId || !tenantSlug) throw new Error("Price quote and tenant are required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const quoteResult = await authenticated.from("trip_price_quotes")
      .select("quote_id,tenant_id,fare_amount_minor,currency_code,pickup_address,destination_address,status,expires_at")
      .eq("quote_id", quoteId).single();
    if (quoteResult.error || !quoteResult.data) throw new Error("Price quote is unavailable.");
    const quote = quoteResult.data;
    if (quote.status !== "quoted" || Date.parse(quote.expires_at) <= Date.now()) throw new Error("Price quote has expired.");
    const origin = new URL(request.url).origin;
    const stripe = createStripeClient();
    const checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price_data: { currency: quote.currency_code.toLowerCase(), unit_amount: quote.fare_amount_minor,
        product_data: { name: "ESH trip", description: `${quote.pickup_address} to ${quote.destination_address}` } }, quantity: 1 }],
      success_url: `${origin}/?tenant=${encodeURIComponent(tenantSlug)}&payment=success&quote=${quote.quote_id}`,
      cancel_url: `${origin}/?tenant=${encodeURIComponent(tenantSlug)}&payment=cancelled`,
      metadata: { quote_id: quote.quote_id, tenant_id: quote.tenant_id },
    }, { idempotencyKey: `rider_quote_${quote.quote_id}` });
    if (!checkout.url) throw new Error("Payment checkout is unavailable.");
    const service = createServiceSupabaseClient();
    const registered = await service.rpc("register_rider_checkout_internal", {
      target_quote_id: quote.quote_id, checkout_session_id_value: checkout.id,
    });
    if (registered.error) throw registered.error;
    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Checkout could not be created." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const quoteId = new URL(request.url).searchParams.get("quote");
    if (!quoteId) throw new Error("Price quote is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const [quoteResult, paymentResult] = await Promise.all([
      authenticated.from("trip_price_quotes").select("quote_id,service_area_id,fare_amount_minor,currency_code,pickup_address,destination_address,route_distance_meters,route_duration_seconds,expires_at,status").eq("quote_id", quoteId).single(),
      authenticated.from("rider_payment_attempts").select("status").eq("quote_id", quoteId).single(),
    ]);
    if (quoteResult.error || !quoteResult.data) throw new Error("Price quote is unavailable.");
    if (paymentResult.error || !paymentResult.data) throw new Error("Payment status is unavailable.");
    return NextResponse.json({
      paymentStatus: paymentResult.data.status,
      quote: {
        quoteId: quoteResult.data.quote_id, serviceAreaId: quoteResult.data.service_area_id,
        fareAmountMinor: quoteResult.data.fare_amount_minor,
        currencyCode: quoteResult.data.currency_code, pickupAddress: quoteResult.data.pickup_address,
        destinationAddress: quoteResult.data.destination_address,
        routeDistanceMeters: quoteResult.data.route_distance_meters,
        routeDurationSeconds: quoteResult.data.route_duration_seconds,
        expiresAt: quoteResult.data.expires_at,
      },
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Payment status could not be loaded." }, { status: 400 });
  }
}
