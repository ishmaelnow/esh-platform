import { timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { getAdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "@/lib/notifications/delivery";
import { deliverNativeNotifications } from "@/lib/notifications/native-push";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  try {
    const service = createServiceSupabaseClient(); const config = getAdminServerConfig();
    // Native claims remain independent of email/web failures.
    const result = await deliverNativeNotifications(service, config, { limit: 20 });
    const support = await deliverQueuedNotifications(service, config,
      { limit: 20, notificationTypes: ["rider_support_update", "driver_support_update"], skipNative: true })
      .catch(() => ({ unavailable: true }));
    return Response.json({ ...result, support }, { status: "unavailable" in support ? 503 : 200 });
  } catch { return Response.json({ message: "Native delivery is unavailable." }, { status: 503 }); }
}
