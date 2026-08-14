import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";
import { getAdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "@/lib/notifications/delivery";

type PreparedRecovery = { alreadyRefunded: boolean; refundId: string; recoveryId?: string; paymentIntentId?: string; amountMinor?: number; transferId?: string | null; transferAmountMinor?: number | null; transferAlreadyReversed?: boolean };

export async function POST(request: Request) {
  let recoveryId: string | null = null;
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const { bookingId, reason } = await request.json() as { bookingId?: string; reason?: string };
    if (!bookingId) throw new Error("Booking is required.");
    if (!reason?.trim()) throw new Error("A refund and recovery reason is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const booking = await authenticated.from("dispatch_bookings").select("booking_id,tenant_id,status").eq("booking_id", bookingId).single();
    if (booking.error || !booking.data) throw new Error("Booking is unavailable.");
    if (booking.data.status !== "completed") throw new Error("Only a completed trip can use this recovery.");
    const prepared = await authenticated.rpc("prepare_completed_trip_refund", { target_booking_id: bookingId, reason_value: reason.trim() });
    if (prepared.error || !prepared.data) throw prepared.error ?? new Error("Refund recovery could not be prepared.");
    const details = prepared.data as unknown as PreparedRecovery;
    recoveryId = details.recoveryId ?? null;
    if (details.alreadyRefunded) return NextResponse.json({ refunded: true });
    if (!details.refundId || !details.recoveryId || !details.paymentIntentId || !details.amountMinor) throw new Error("Refund recovery details are incomplete.");
    const stripe = createStripeClient();
    const service = createServiceSupabaseClient();
    if (details.transferId && !details.transferAlreadyReversed) {
      if (!details.transferAmountMinor) throw new Error("Driver transfer recovery amount is unavailable.");
      const reversal = await stripe.transfers.createReversal(details.transferId, {
        amount: details.transferAmountMinor, description: "ESH completed-trip refund recovery",
        metadata: { booking_id: bookingId, completed_trip_refund_recovery_id: details.recoveryId },
      }, { idempotencyKey: `completed_trip_transfer_reversal_${details.recoveryId}` });
      const recorded = await service.rpc("record_completed_trip_transfer_reversal_internal", { target_recovery_id: details.recoveryId, provider_transfer_reversal_id_value: reversal.id });
      if (recorded.error || !recorded.data) throw recorded.error ?? new Error("Transfer reversal could not be recorded.");
    }
    const refund = await stripe.refunds.create({ payment_intent: details.paymentIntentId, amount: details.amountMinor, reason: "requested_by_customer", metadata: { booking_id: bookingId, rider_payment_refund_id: details.refundId } }, { idempotencyKey: `completed_trip_refund_${details.refundId}` });
    if (refund.status === "failed" || refund.status === "canceled") throw new Error(refund.failure_reason ?? "Stripe refund failed.");
    const completed = await service.rpc("complete_completed_trip_refund_internal", { target_recovery_id: details.recoveryId, provider_refund_id_value: refund.id });
    if (completed.error || !completed.data) throw completed.error ?? new Error("Refund recovery could not be completed.");
    await deliverQueuedNotifications(service, getAdminServerConfig(), { tenantId: booking.data.tenant_id, limit: 20 }).catch(() => undefined);
    return NextResponse.json({ refunded: true });
  } catch (error) {
    if (recoveryId) await createServiceSupabaseClient().rpc("fail_completed_trip_refund_recovery_internal", { target_recovery_id: recoveryId, failure_message_value: error instanceof Error ? error.message : "Refund recovery failed." });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Refund recovery failed." }, { status: 400 });
  }
}
