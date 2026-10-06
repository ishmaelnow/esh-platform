import { timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { getAdminServerConfig } from "@/lib/config";
import { deliverNativeNotifications } from "@/lib/notifications/native-push";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  try {
    const result = await deliverNativeNotifications(createServiceSupabaseClient(), getAdminServerConfig(), { limit: 20 });
    return Response.json(result);
  } catch { return Response.json({ message: "Native delivery is unavailable." }, { status: 503 }); }
}
