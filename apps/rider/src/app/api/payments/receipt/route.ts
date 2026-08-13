import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const paymentAttemptId = new URL(request.url).searchParams.get("paymentAttemptId");
    if (!paymentAttemptId) throw new Error("Payment is required.");

    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const paymentResult = await authenticated.from("rider_payment_attempts")
      .select("provider,provider_payment_intent_id,status")
      .eq("payment_attempt_id", paymentAttemptId).single();
    if (paymentResult.error || !paymentResult.data) throw new Error("Payment is unavailable.");
    if (paymentResult.data.provider !== "stripe" || !paymentResult.data.provider_payment_intent_id)
      throw new Error("A Stripe receipt is unavailable for this payment.");
    if (!['paid', 'refunded'].includes(paymentResult.data.status))
      throw new Error("A receipt is available only for a completed payment.");

    const stripe = createStripeClient();
    const intent = await stripe.paymentIntents.retrieve(paymentResult.data.provider_payment_intent_id, {
      expand: ["latest_charge"],
    });
    const charge = typeof intent.latest_charge === "string" ? null : intent.latest_charge;
    if (!charge?.receipt_url) throw new Error("Stripe has not provided a receipt for this payment.");
    const details = charge.payment_method_details;
    const paymentMethod = details?.card?.last4
      ? `${(details.card.brand ?? "card").toUpperCase()} ending in ${details.card.last4}`
      : details?.type ? details.type.replaceAll("_", " ") : "Stripe";
    return NextResponse.json({ receiptUrl: charge.receipt_url, paymentMethod });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Receipt could not be loaded." }, { status: 400 });
  }
}
