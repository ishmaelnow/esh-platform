import { timingSafeEqual } from "node:crypto";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { getAdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "@/lib/notifications/delivery";

function authorized(request: Request) {
  const configured = process.env.NOTIFICATION_DELIVERY_SECRET;
  const supplied = request.headers.get("x-esh-notification-secret");
  if (!configured || configured.length < 32 || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ message: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json() as { tenantId?: string };
    if (!body.tenantId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.tenantId))
      return Response.json({ message: "Tenant is required." }, { status: 400 });
    const delivery = await deliverQueuedNotifications(
      createServiceSupabaseClient(), getAdminServerConfig(), { tenantId: body.tenantId, limit: 20 },
    );
    return Response.json({ ok: true, ...delivery });
  } catch {
    return Response.json({ message: "Notification delivery failed." }, { status: 500 });
  }
}
