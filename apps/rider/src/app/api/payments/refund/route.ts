import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";
import { requestNotificationDelivery } from "../../../../lib/request-notification-delivery";

type PreparedRefund = { alreadyRefunded: boolean; refundId?: string; paymentIntentId?: string; amountMinor?: number };

export async function POST(request: Request) {
  let refundId: string | null = null;
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const { bookingId } = await request.json() as { bookingId?: string };
    if (!bookingId) throw new Error("Booking is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const booking = await authenticated.from("dispatch_bookings").select("booking_id,tenant_id").eq("booking_id", bookingId).single();
    if (booking.error || !booking.data) throw new Error("Rider booking was not found.");
    const service = createServiceSupabaseClient();
    const payment = await service.from("rider_payment_attempts").select("payment_attempt_id")
      .eq("booking_id", bookingId).eq("status", "paid").maybeSingle();
    if (payment.error) throw payment.error;
    if (!payment.data) {
      const cancelled = await service.rpc("cancel_wallet_only_booking_internal", { target_booking_id: bookingId });
      if (cancelled.error) throw cancelled.error;
      return NextResponse.json({ refunded: true, walletRestored: true });
    }
    const prepared = await service.rpc("prepare_pretrip_refund_internal", { target_booking_id: bookingId });
    if (prepared.error || !prepared.data) throw prepared.error ?? new Error("Refund could not be prepared.");
    const details = prepared.data as unknown as PreparedRefund; refundId = details.refundId ?? null;
    if (details.alreadyRefunded) return NextResponse.json({ refunded: true });
    if (!details.refundId || !details.paymentIntentId || !details.amountMinor) throw new Error("Refund details are incomplete.");
    const stripe = createStripeClient();
    await stripe.paymentIntents.retrieve(details.paymentIntentId);
    const refund = await stripe.refunds.create({ payment_intent: details.paymentIntentId,
      amount: details.amountMinor, reason: "requested_by_customer",
      metadata: { booking_id: bookingId, rider_payment_refund_id: details.refundId } },
      { idempotencyKey: `pretrip_refund_${details.refundId}` });
    if (refund.status === "failed" || refund.status === "canceled") throw new Error(refund.failure_reason ?? "Stripe refund failed.");
    const completed = await service.rpc("complete_pretrip_refund_internal", {
      target_refund_id: details.refundId, provider_refund_id_value: refund.id,
    });
    if (completed.error) throw completed.error;
    await requestNotificationDelivery(booking.data.tenant_id);
    const wallet = await service.from("rider_wallet_quote_allocations").select("status")
      .eq("booking_id", bookingId).maybeSingle();
    return NextResponse.json({ refunded: true, walletRestored: wallet.data?.status === "restored" });
  } catch (error) {
    if (refundId) await createServiceSupabaseClient().rpc("fail_pretrip_refund_internal", {
      target_refund_id: refundId, failure_message_value: error instanceof Error ? error.message : "Refund failed.",
    });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Refund failed." }, { status: 400 });
  }
}
