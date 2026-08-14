import type { Stripe } from "@esh-platform/stripe";

export const stripeDisputeEventTypes = [
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
] as const;

export function isStripeDisputeEvent(type: string) {
  return (stripeDisputeEventTypes as readonly string[]).includes(type);
}

export function disputeRecordArgs(dispute: Stripe.Dispute, eventType: string) {
  const paymentIntentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!paymentIntentId || !chargeId) throw new Error("Stripe dispute payment references are required.");
  return {
    provider_dispute_id_value: dispute.id,
    provider_charge_id_value: chargeId,
    provider_payment_intent_id_value: paymentIntentId,
    status_value: dispute.status,
    reason_value: dispute.reason,
    currency_code_value: dispute.currency.toUpperCase(),
    amount_minor_value: dispute.amount,
    evidence_due_at_value: dispute.evidence_details.due_by
      ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null,
    event_type_value: eventType,
  };
}
