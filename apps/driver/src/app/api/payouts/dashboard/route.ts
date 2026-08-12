import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { createStripeClient } from "@esh-platform/stripe";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const summary = await authenticated.rpc("my_driver_portal_summary");
    if (summary.error || !summary.data) throw new Error("Driver profile is unavailable.");
    const driver = summary.data as unknown as { driverProfileId: string };
    const service = createServiceSupabaseClient();
    const record = await service.from("driver_payout_accounts").select("provider_account_id")
      .eq("driver_profile_id", driver.driverProfileId).single();
    if (record.error || !record.data) throw new Error("Complete payout setup first.");
    const link = await createStripeClient().accounts.createLoginLink(record.data.provider_account_id);
    return NextResponse.json({ url: link.url });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Payout dashboard could not be opened." }, { status: 400 });
  }
}
