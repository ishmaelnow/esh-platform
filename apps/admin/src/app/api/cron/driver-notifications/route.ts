import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { getAdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "@/lib/notifications/delivery";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ message: "Unauthorized." }, { status: 401 });
  }

  try {
    const service = createServiceSupabaseClient();
    const { data: queued, error: queueError } = await service.rpc(
      "queue_driver_expiration_notifications",
      { target_date: new Date().toISOString().slice(0, 10) },
    );
    if (queueError) throw queueError;
    const delivery = await deliverQueuedNotifications(service, getAdminServerConfig(), {
      limit: 50,
    });
    return Response.json({
      ok: true,
      expirationNotificationsQueued: queued ?? 0,
      ...delivery,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Scheduled notification run failed." },
      { status: 500 },
    );
  }
}
