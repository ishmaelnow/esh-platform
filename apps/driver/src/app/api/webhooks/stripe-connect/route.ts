import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("stripe-signature");
    const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    if (!signature || !secret) throw new Error("Connect webhook configuration is unavailable.");
    const stripe = createStripeClient();
    const event = stripe.webhooks.constructEvent(await request.text(), signature, secret);
    if (event.type !== "account.updated") return NextResponse.json({ received: true });
    const account = event.data.object;
    const result = await createServiceSupabaseClient().rpc("update_driver_payout_account_internal", {
      provider_account_id_value: account.id, details_submitted_value: account.details_submitted,
      charges_enabled_value: account.charges_enabled, payouts_enabled_value: account.payouts_enabled,
      transfers_capability_status_value: account.capabilities?.transfers ?? null,
      currently_due_value: account.requirements?.currently_due ?? [],
      eventually_due_value: account.requirements?.eventually_due ?? [],
      disabled_reason_value: account.requirements?.disabled_reason ?? null,
    });
    if (result.error) throw result.error;
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ message: "Invalid or unprocessable webhook." }, { status: 400 }); }
}
