import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient, getStripeWebhookSecret, type Stripe } from "@esh-platform/stripe";
import { requestNotificationDelivery } from "../../../../lib/request-notification-delivery";
import { disputeRecordArgs, isStripeDisputeEvent } from "../../../../lib/stripe-dispute";

export async function POST(request: Request) {
  let eventType = "unverified";
  let objectId = "unavailable";
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new Error("Stripe signature is required.");
    const stripe = createStripeClient();
    const event = stripe.webhooks.constructEvent(await request.text(), signature, getStripeWebhookSecret());
    eventType = event.type;
    const eventObject = event.data.object as { id?: unknown };
    if (typeof eventObject.id === "string") objectId = eventObject.id;
    if (isStripeDisputeEvent(event.type)) {
      const dispute = event.data.object as Stripe.Dispute;
      const args = disputeRecordArgs(dispute, event.type);
      const service = createServiceSupabaseClient();
      const result = await service.rpc("record_rider_payment_dispute_internal", args);
      if (result.error) throw result.error;
      const attempt = await service.from("rider_payment_attempts").select("tenant_id")
        .eq("provider_payment_intent_id", args.provider_payment_intent_id_value).single();
      if (!attempt.error && attempt.data) await requestNotificationDelivery(attempt.data.tenant_id);
      return NextResponse.json({ received: true });
    }
    if (["payment_intent.succeeded", "payment_intent.payment_failed"].includes(event.type)) {
      const intent = event.data.object as Stripe.PaymentIntent;
      const quoteId = intent.metadata.quote_id;
      const occurrenceId = intent.metadata.occurrence_id;
      if (!quoteId || !occurrenceId) return NextResponse.json({ received: true });
      const service = createServiceSupabaseClient();
      const quote = await service.from("trip_price_quotes").select("currency_code").eq("quote_id", quoteId).single();
      if (quote.error || !quote.data) throw quote.error ?? new Error("Automatic-payment quote is unavailable.");
      const status = event.type === "payment_intent.succeeded" ? "paid" : "failed";
      const recorded = await service.rpc("record_rider_payment_internal", {
        checkout_session_id_value: `off_session:${quoteId}`,
        payment_intent_id_value: intent.id, payment_status_value: status,
        amount_minor_value: intent.amount, currency_code_value: quote.data.currency_code,
        failure_message_value: status === "failed" ? "Stripe declined the automatic payment." : null,
      });
      if (recorded.error) throw recorded.error;
      if (status === "paid") {
        const finalized = await service.rpc("finalize_recurring_autopay_internal", {
          target_occurrence_id: occurrenceId, target_quote_id: quoteId,
        });
        if (finalized.error) throw finalized.error;
      } else {
        const failed = await service.rpc("fail_recurring_autopay_internal", {
          target_occurrence_id: occurrenceId,
          failure_message_value: "Stripe declined the automatic payment.", retryable_value: false,
        });
        if (failed.error) throw failed.error;
      }
      const attempt = await service.from("rider_payment_attempts").select("tenant_id")
        .eq("quote_id", quoteId).single();
      if (!attempt.error && attempt.data) await requestNotificationDelivery(attempt.data.tenant_id);
      return NextResponse.json({ received: true });
    }
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
    if (status === "paid" && typeof session.customer === "string" && typeof session.payment_intent === "string") {
      const intent = await stripe.paymentIntents.retrieve(session.payment_intent);
      const paymentMethodId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
      if (paymentMethodId) {
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
        const saved = await service.rpc("record_rider_saved_payment_method_internal", {
          target_quote_id: String(session.metadata?.quote_id ?? ""),
          provider_customer_id_value: session.customer,
          provider_payment_method_id_value: paymentMethodId,
          brand_value: paymentMethod.card?.brand ?? null,
          last4_value: paymentMethod.card?.last4 ?? null,
          expires_month_value: paymentMethod.card?.exp_month ?? null,
          expires_year_value: paymentMethod.card?.exp_year ?? null,
        });
        if (saved.error && !saved.error.message.includes("record_rider_saved_payment_method_internal")) throw saved.error;
      }
    }
    const attempt = await service.from("rider_payment_attempts").select("tenant_id")
      .eq("provider_checkout_session_id", session.id).single();
    if (!attempt.error && attempt.data) await requestNotificationDelivery(attempt.data.tenant_id);
    return NextResponse.json({ received: true });
  } catch (error) {
    const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : {};
    console.error("Stripe webhook processing failed", {
      eventType,
      objectId,
      name: error instanceof Error ? error.name : typeof record.name === "string" ? record.name : "UnknownError",
      message: error instanceof Error ? error.message : typeof record.message === "string" ? record.message : "Unknown webhook error",
      code: typeof record.code === "string" ? record.code : undefined,
      details: typeof record.details === "string" ? record.details : undefined,
      hint: typeof record.hint === "string" ? record.hint : undefined,
    });
    return NextResponse.json({ message: "Invalid or unprocessable webhook." }, { status: 400 });
  }
}
