import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

type TransferPreparation = { alreadyTransferred: boolean; transferId: string; amountMinor?: number;
  currencyCode?: string; paymentIntentId?: string; providerAccountId?: string };

export async function POST(request: Request) {
  let transferId: string | null = null;
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const body = await request.json() as { bookingId?: string };
    if (!body.bookingId) throw new Error("Trip is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const summary = await authenticated.rpc("my_driver_portal_summary");
    if (summary.error || !summary.data) throw new Error("Driver profile is unavailable.");
    const driver = summary.data as unknown as { driverProfileId: string };
    const service = createServiceSupabaseClient();
    const prepared = await service.rpc("prepare_driver_earning_transfer_internal", {
      target_driver_profile_id: driver.driverProfileId, target_booking_id: body.bookingId,
    });
    if (prepared.error || !prepared.data) throw prepared.error ?? new Error("Transfer could not be prepared.");
    const details = prepared.data as unknown as TransferPreparation;
    transferId = details.transferId;
    if (details.alreadyTransferred) return NextResponse.json({ transferred: true });
    if (!details.amountMinor || !details.currencyCode || !details.paymentIntentId || !details.providerAccountId)
      throw new Error("Transfer details are incomplete.");
    const stripe = createStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(details.paymentIntentId);
    const sourceTransaction = typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id;
    if (paymentIntent.status !== "succeeded" || !sourceTransaction)
      throw new Error("The Rider payment is not settled in this Stripe platform.");
    const transfer = await stripe.transfers.create({ amount: details.amountMinor,
      currency: details.currencyCode.toLowerCase(), destination: details.providerAccountId,
      source_transaction: sourceTransaction, transfer_group: `booking_${body.bookingId}`,
      metadata: { booking_id: body.bookingId, driver_profile_id: driver.driverProfileId,
        driver_earning_transfer_id: details.transferId } },
      { idempotencyKey: `driver_earning_transfer_${details.transferId}` });
    const completed = await service.rpc("complete_driver_earning_transfer_internal", {
      target_transfer_id: details.transferId, provider_transfer_id_value: transfer.id,
    });
    if (completed.error) throw completed.error;
    return NextResponse.json({ transferred: true });
  } catch (error) {
    if (transferId) await createServiceSupabaseClient().rpc("fail_driver_earning_transfer_internal", {
      target_transfer_id: transferId,
      failure_message_value: error instanceof Error ? error.message : "Stripe transfer failed.",
    });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Stripe transfer failed." }, { status: 400 });
  }
}
