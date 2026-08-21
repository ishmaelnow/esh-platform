import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

type PreparedSettlement = {
  alreadySettled?: boolean;
  settlementId: string;
  direction: "refund" | "charge";
  amountMinor: number;
  currencyCode: string;
  paymentIntentId?: string;
  customerId?: string;
  paymentMethodId?: string;
};

export async function POST(request: Request) {
  let settlementId: string | null = null;
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const { reconciliationId } = await request.json() as { reconciliationId?: string };
    if (!reconciliationId) throw new Error("Fare reconciliation is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const reconciliation = await authenticated.from("trip_fare_reconciliations")
      .select("tenant_id").eq("reconciliation_id", reconciliationId).single();
    if (reconciliation.error || !reconciliation.data) throw new Error("Fare reconciliation is unavailable.");
    const permission = await authenticated.rpc("can_manage_ledger", { target_tenant_id: reconciliation.data.tenant_id });
    if (permission.error || !permission.data) throw new Error("Ledger management access is required.");
    const service = createServiceSupabaseClient();
    const prepared = await service.rpc("prepare_trip_fare_settlement_internal", { target_reconciliation_id: reconciliationId });
    if (prepared.error || !prepared.data) throw prepared.error ?? new Error("Fare settlement could not be prepared.");
    const details = prepared.data as unknown as PreparedSettlement;
    settlementId = details.settlementId;
    if (details.alreadySettled) return NextResponse.json({ settled: true });
    if (!details.paymentIntentId) throw new Error("Original payment is unavailable.");
    const stripe = createStripeClient();
    let providerReference: string;
    if (details.direction === "refund") {
      const refund = await stripe.refunds.create({
        payment_intent: details.paymentIntentId, amount: details.amountMinor,
        reason: "requested_by_customer", metadata: { reconciliation_id: reconciliationId, settlement_id: settlementId },
      }, { idempotencyKey: `trip_fare_refund_${settlementId}` });
      if (refund.status === "failed" || refund.status === "canceled") throw new Error(refund.failure_reason ?? "Stripe refund failed.");
      providerReference = refund.id;
    } else {
      if (!details.customerId || !details.paymentMethodId) {
        await service.rpc("fail_trip_fare_settlement_internal", { target_settlement_id: settlementId, failure_message_value: "A reusable Rider payment method is unavailable.", balance_due_value: true });
        return NextResponse.json({ settled: false, balanceDue: true, message: "A new payment method is required for the fare difference." }, { status: 402 });
      }
      const intent = await stripe.paymentIntents.create({
        amount: details.amountMinor, currency: details.currencyCode.toLowerCase(), customer: details.customerId,
        payment_method: details.paymentMethodId, confirm: true, off_session: true,
        metadata: { reconciliation_id: reconciliationId, settlement_id: settlementId },
      }, { idempotencyKey: `trip_fare_charge_${settlementId}` });
      if (intent.status !== "succeeded") throw new Error(`Stripe fare-difference charge is ${intent.status}.`);
      providerReference = intent.id;
    }
    const completed = await service.rpc("complete_trip_fare_settlement_internal", { target_settlement_id: settlementId, provider_reference_value: providerReference });
    if (completed.error || !completed.data) throw completed.error ?? new Error("Fare settlement could not be recorded.");
    return NextResponse.json({ settled: true, direction: details.direction, amountMinor: details.amountMinor });
  } catch (error) {
    if (settlementId) await createServiceSupabaseClient().rpc("fail_trip_fare_settlement_internal", { target_settlement_id: settlementId, failure_message_value: error instanceof Error ? error.message : "Fare settlement failed.", balance_due_value: false });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Fare settlement failed." }, { status: 400 });
  }
}
