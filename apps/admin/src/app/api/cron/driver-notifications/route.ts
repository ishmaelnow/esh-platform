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
    const targetDate = new Date().toISOString().slice(0, 10);
    const [driverQueue, vehicleQueue] = await Promise.all([
      service.rpc("queue_driver_expiration_notifications", { target_date: targetDate }),
      service.rpc("queue_vehicle_expiration_notifications", { target_date: targetDate }),
    ]);
    if (driverQueue.error) throw driverQueue.error;
    if (vehicleQueue.error) throw vehicleQueue.error;
    const delivery = await deliverQueuedNotifications(service, getAdminServerConfig(), {
      limit: 50,
    });
    return Response.json({
      ok: true,
      expirationNotificationsQueued: (driverQueue.data ?? 0) + (vehicleQueue.data ?? 0),
      driverExpirationNotificationsQueued: driverQueue.data ?? 0,
      vehicleExpirationNotificationsQueued: vehicleQueue.data ?? 0,
      ...delivery,
    });
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Scheduled notification run failed." },
      { status: 500 },
    );
  }
}
