import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { requestNotificationDelivery } from "../../../../lib/request-notification-delivery";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const summary = await authenticated.rpc("my_driver_portal_summary");
    if (summary.error || !summary.data) throw new Error("Driver profile is unavailable.");
    const driverProfileId = (summary.data as { driverProfileId?: string }).driverProfileId;
    if (!driverProfileId) throw new Error("Driver profile is unavailable.");
    const driver = await createServiceSupabaseClient().from("driver_profiles")
      .select("tenant_id").eq("driver_profile_id", driverProfileId).single();
    if (driver.error || !driver.data) throw new Error("Driver tenant is unavailable.");
    return NextResponse.json({ requested: await requestNotificationDelivery(driver.data.tenant_id) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Delivery could not be requested." }, { status: 400 });
  }
}
