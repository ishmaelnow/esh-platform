import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";
import type { Stripe } from "@esh-platform/stripe";
import { requestNotificationDelivery } from "../../../../lib/request-notification-delivery";
import { transferReferencesFromBalanceTransactions, type StripeBalanceTransactionReference } from "../../../../lib/payout-reconciliation";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!signature || !secret) throw new Error("Connect webhook configuration is unavailable.");
    const stripe = createStripeClient();
    const event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
    const service = createServiceSupabaseClient();
    let result;
    if (event.type === "account.updated") {
      const account = event.data.object;
      result = await service.rpc("update_driver_payout_account_internal", {
        provider_account_id_value: account.id, details_submitted_value: account.details_submitted,
        charges_enabled_value: account.charges_enabled, payouts_enabled_value: account.payouts_enabled,
        transfers_capability_status_value: account.capabilities?.transfers ?? null,
        currently_due_value: account.requirements?.currently_due ?? [],
        eventually_due_value: account.requirements?.eventually_due ?? [],
        disabled_reason_value: account.requirements?.disabled_reason ?? null,
      });
    } else if (["payout.created", "payout.updated", "payout.paid", "payout.failed"].includes(event.type)) {
      if (!event.account) throw new Error("Connected payout account context is required.");
      const payout = event.data.object as Stripe.Payout;
      result = await service.rpc("record_driver_bank_payout_internal", {
        provider_account_id_value: event.account, provider_payout_id_value: payout.id,
        status_value: payout.status, currency_code_value: payout.currency,
        amount_minor_value: payout.amount, automatic_value: payout.automatic,
        method_value: payout.method, destination_reference_value: typeof payout.destination === "string"
          ? payout.destination : payout.destination?.id ?? null,
        expected_arrival_at_value: new Date(payout.arrival_date * 1000).toISOString(),
        failure_code_value: payout.failure_code ?? null, failure_message_value: payout.failure_message ?? null,
        provider_created_at_value: new Date(payout.created * 1000).toISOString(),
      });
      if (result.error) throw result.error;
      try {
        const balanceTransactions: StripeBalanceTransactionReference[] = [];
        if (payout.automatic) {
          for await (const transaction of stripe.balanceTransactions.list(
            { payout: payout.id, limit: 100 }, { stripeAccount: event.account },
          )) {
            balanceTransactions.push(transaction);
          }
        }
        const references = transferReferencesFromBalanceTransactions(balanceTransactions);
        const reconciliation = await service.rpc("reconcile_driver_bank_payout_internal", {
          provider_account_id_value: event.account,
          provider_payout_id_value: payout.id,
          provider_transfer_ids_value: references.map(({ providerTransferId }) => providerTransferId),
          provider_balance_transaction_ids_value: references.map(({ providerBalanceTransactionId }) => providerBalanceTransactionId),
        });
        if (reconciliation.error) throw reconciliation.error;
      } catch (error) {
        await service.rpc("fail_driver_bank_payout_reconciliation_internal", {
          provider_account_id_value: event.account,
          provider_payout_id_value: payout.id,
          failure_message_value: error instanceof Error ? error.message : "Stripe payout reconciliation failed.",
        });
        throw error;
      }
    } else return NextResponse.json({ received: true });
    if (result.error) throw result.error;
    if (event.account && event.type.startsWith("payout.")) {
      const payoutAccount = await service.from("driver_payout_accounts").select("tenant_id")
        .eq("provider_account_id", event.account).single();
      if (!payoutAccount.error && payoutAccount.data)
        await requestNotificationDelivery(payoutAccount.data.tenant_id);
    }
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ message: "Invalid or unprocessable webhook." }, { status: 400 }); }
}
