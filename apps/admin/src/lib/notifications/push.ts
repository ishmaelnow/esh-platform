import webpush from "web-push";
import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";

type PushNotification = {
  notification_id: string; tenant_id: string; notification_type: string;
  rider_profile_id: string | null; driver_profile_id: string | null;
  payload: unknown;
};

const urgentTypes = new Set([
  "dispatch_offer_created", "rider_driver_accepted", "rider_driver_arrived",
  "rider_trip_started", "rider_booking_cancelled", "rider_scheduled_reminder",
  "rider_recurring_autopay_failed", "driver_bank_payout_failed",
]);

export function buildPrivacySafePush(notificationType: string, payload: Record<string, unknown>, config: AdminServerConfig) {
  const rider = notificationType.startsWith("rider_");
  const title = urgentTypes.has(notificationType) ? "Action needed in ESH" : "ESH update";
  const messages: Record<string, string> = {
    dispatch_offer_created: "You have a new trip offer.",
    rider_driver_accepted: "A Driver accepted your trip.",
    rider_driver_arrived: "Your Driver has arrived.",
    rider_trip_started: "Your trip has started.",
    rider_trip_completed: "Your trip is complete.",
    rider_booking_cancelled: "Your trip was cancelled.",
    rider_scheduled_reminder: "Your scheduled trip is coming up.",
    rider_recurring_autopay_failed: "Automatic payment needs your attention.",
    rider_recurring_autopay_succeeded: "Your recurring trip was paid and scheduled.",
    driver_bank_payout_failed: "A bank payout needs your attention.",
  };
  const url = new URL("/", rider ? config.redirects.riderAppUrl : config.redirects.driverAppUrl);
  if (rider && typeof payload.tenant_slug === "string") url.searchParams.set("tenant", payload.tenant_slug);
  return { title, body: messages[notificationType] ?? "Open ESH to view your latest update.",
    url: url.toString(), tag: `esh-${notificationType}` };
}

export async function deliverNotificationPush(
  service: PlatformSupabaseClient, config: AdminServerConfig, notification: PushNotification,
) {
  if (!config.webPush.subject || !config.webPush.publicKey || !config.webPush.privateKey)
    return { delivered: 0, failed: 0, skipped: true };
  webpush.setVapidDetails(config.webPush.subject, config.webPush.publicKey, config.webPush.privateKey);
  let query = service.from("push_subscriptions").select("*").eq("tenant_id", notification.tenant_id).eq("status", "active");
  query = notification.rider_profile_id
    ? query.eq("rider_profile_id", notification.rider_profile_id)
    : notification.driver_profile_id ? query.eq("driver_profile_id", notification.driver_profile_id) : query.eq("person_id", "none");
  const subscriptions = await query;
  if (subscriptions.error) throw subscriptions.error;
  let delivered = 0; let failed = 0;
  const payload = JSON.stringify(buildPrivacySafePush(notification.notification_type,
    notification.payload as Record<string, unknown>, config));
  for (const subscription of subscriptions.data ?? []) {
    const existing = await service.from("push_delivery_attempts").select("push_delivery_attempt_id,status,attempt_count")
      .eq("notification_id", notification.notification_id)
      .eq("push_subscription_id", subscription.push_subscription_id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.status === "delivered" || existing.data?.status === "expired") continue;
    const attemptCount = (existing.data?.attempt_count ?? 0) + 1;
    const attempt = existing.data ? existing.data : (await service.from("push_delivery_attempts").insert({
      tenant_id: notification.tenant_id, notification_id: notification.notification_id,
      push_subscription_id: subscription.push_subscription_id,
    }).select("push_delivery_attempt_id,status,attempt_count").single()).data;
    if (!attempt) continue;
    try {
      const result = await webpush.sendNotification({ endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh_key, auth: subscription.auth_key } }, payload, { TTL: 300, urgency: "high" });
      await service.from("push_delivery_attempts").update({ status: "delivered", attempt_count: attemptCount,
        response_status: result.statusCode, delivered_at: new Date().toISOString(), failure_message: null })
        .eq("push_delivery_attempt_id", attempt.push_delivery_attempt_id);
      await service.from("push_subscriptions").update({ last_used_at: new Date().toISOString() })
        .eq("push_subscription_id", subscription.push_subscription_id);
      delivered += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : null;
      const expired = statusCode === 404 || statusCode === 410;
      await service.from("push_delivery_attempts").update({ status: expired ? "expired" : "failed",
        attempt_count: attemptCount, response_status: statusCode,
        failure_message: error instanceof Error ? error.message.slice(0, 500) : "Push delivery failed." })
        .eq("push_delivery_attempt_id", attempt.push_delivery_attempt_id);
      if (expired) await service.from("push_subscriptions").update({ status: "expired", disabled_at: new Date().toISOString() })
        .eq("push_subscription_id", subscription.push_subscription_id);
      failed += 1;
    }
  }
  return { delivered, failed, skipped: false };
}
