import { describe, expect, it } from "vitest";
import type { Stripe } from "@esh-platform/stripe";
import { disputeRecordArgs, isStripeDisputeEvent } from "./stripe-dispute";

describe("Stripe Rider disputes", () => {
  it("accepts only the five dispute lifecycle events", () => {
    expect(isStripeDisputeEvent("charge.dispute.funds_withdrawn")).toBe(true);
    expect(isStripeDisputeEvent("checkout.session.completed")).toBe(false);
  });

  it("maps only authoritative processor fields into the service RPC", () => {
    const dispute = {
      id: "dp_test", payment_intent: "pi_test", charge: "ch_test", status: "needs_response",
      reason: "fraudulent", currency: "usd", amount: 1059,
      evidence_details: { due_by: 1_787_000_000 },
      balance_transactions: [{ net: -2559, fee: 1500 }],
    } as unknown as Stripe.Dispute;
    expect(disputeRecordArgs(dispute, "charge.dispute.created")).toMatchObject({
      provider_dispute_id_value: "dp_test", provider_payment_intent_id_value: "pi_test",
      currency_code_value: "USD", amount_minor_value: 1059,
      fee_minor_value: 1500, withdrawn_minor_value: 2559, reinstated_minor_value: 0,
    });
  });
});
