import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient, getStripeWebhookSecret, type Stripe } from "@esh-platform/stripe";
import { requestNotificationDelivery } from "../../../../lib/request-notification-delivery";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new Error("Stripe signature is required.");
    const stripe = createStripeClient();
    const event = stripe.webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret());
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type))
      return NextResponse.json({ received: true });
    const session = event.data.object as Stripe.Checkout.Session;
    if (event.type === "checkout.session.completed" && session.payment_status !== "paid")
      return NextResponse.json({ received: true });
    const status = event.type === "checkout.session.expired" ? "expired"
      : event.type === "checkout.session.async_payment_failed" ? "failed" : "paid";
    const service = createServiceSupabaseClient();
    const result = await service.rpc("record_rider_payment_internal", {
      checkout_session_id_value: session.id,
      payment_intent_id_value: typeof session.payment_intent === "string" ? session.payment_intent : "",
      payment_status_value: status,
      amount_minor_value: session.amount_total ?? 0,
      currency_code_value: (session.currency ?? "").toUpperCase(),
      failure_message_value: status === "failed" ? "Stripe reported an asynchronous payment failure." : null,
    });
    if (result.error) throw result.error;
    const attempt = await service.from("rider_payment_attempts").select("tenant_id")
      .eq("provider_checkout_session_id", session.id).single();
    if (!attempt.error && attempt.data) await requestNotificationDelivery(attempt.data.tenant_id);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ message: "Invalid or unprocessable webhook." }, { status: 400 });
  }
}
