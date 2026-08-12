import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const [summary, payout] = await Promise.all([
      authenticated.rpc("my_driver_portal_summary"), authenticated.rpc("my_driver_payout_account"),
    ]);
    if (summary.error || !summary.data) throw new Error("Driver profile is unavailable.");
    if (payout.error) throw payout.error;
    const driver = summary.data as unknown as { driverProfileId: string; email: string | null };
    const current = payout.data as unknown as { exists: boolean };
    const service = createServiceSupabaseClient();
    const stripe = createStripeClient();
    let providerAccountId: string | null = null;
    if (current.exists) {
      const record = await service.from("driver_payout_accounts").select("provider_account_id")
        .eq("driver_profile_id", driver.driverProfileId).single();
      if (record.error || !record.data) throw new Error("Payout account is unavailable.");
      providerAccountId = record.data.provider_account_id;
    } else {
      const account = await stripe.accounts.create({ country: "US",
        ...(driver.email ? { email: driver.email } : {}),
        controller: {
          fees: { payer: "application" },
          losses: { payments: "application" },
          stripe_dashboard: { type: "express" },
        },
        capabilities: { transfers: { requested: true } }, metadata: { driver_profile_id: driver.driverProfileId } },
        { idempotencyKey: `driver_connect_v2_${driver.driverProfileId}` });
      providerAccountId = account.id;
      const registered = await service.rpc("register_driver_payout_account_internal", {
        target_driver_profile_id: driver.driverProfileId, provider_account_id_value: account.id,
      });
      if (registered.error) throw registered.error;
    }
    const origin = new URL(request.url).origin;
    const link = await stripe.accountLinks.create({ account: providerAccountId,
      refresh_url: `${origin}/?payout=refresh`, return_url: `${origin}/?payout=return`, type: "account_onboarding" });
    return NextResponse.json({ url: link.url });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Payout onboarding could not be opened." }, { status: 400 });
  }
}
