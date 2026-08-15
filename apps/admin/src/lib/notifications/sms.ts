import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";

type SmsNotification = {
  notification_id: string; tenant_id: string; notification_type: string;
  rider_profile_id: string | null; driver_profile_id: string | null;
};

const urgentSmsTypes = new Set([
  "dispatch_offer_created", "rider_driver_accepted", "rider_driver_arrived",
  "rider_trip_started", "rider_booking_cancelled", "rider_scheduled_reminder",
  "rider_recurring_autopay_failed", "driver_bank_payout_failed",
]);

export function buildPrivacySafeSms(notificationType: string) {
  if (!urgentSmsTypes.has(notificationType)) return null;
  const messages: Record<string, string> = {
    dispatch_offer_created: "ESH: You have a new trip offer. Open the Driver app to respond.",
    rider_driver_accepted: "ESH: A Driver accepted your trip. Open the Rider app for details.",
    rider_driver_arrived: "ESH: Your Driver has arrived. Open the Rider app for details.",
    rider_trip_started: "ESH: Your trip has started.",
    rider_booking_cancelled: "ESH: Your trip was cancelled. Open the Rider app for details.",
    rider_scheduled_reminder: "ESH: Your scheduled trip is coming up. Open the Rider app for details.",
    rider_recurring_autopay_failed: "ESH: Automatic payment needs your attention. Open the Rider app.",
    driver_bank_payout_failed: "ESH: A bank payout needs your attention. Open the Driver app.",
  };
  return messages[notificationType] ?? null;
}

export async function deliverNotificationSms(
  service: PlatformSupabaseClient, config: AdminServerConfig, notification: SmsNotification,
) {
  const body = buildPrivacySafeSms(notification.notification_type);
  if (!body || !config.twilio.accountSid || !config.twilio.authToken || !config.twilio.messagingServiceSid)
    return { accepted: 0, failed: 0, skipped: true };
  let query = service.from("sms_notification_subscriptions").select("*")
    .eq("tenant_id", notification.tenant_id).eq("status", "active");
  query = notification.rider_profile_id
    ? query.eq("rider_profile_id", notification.rider_profile_id)
    : notification.driver_profile_id
      ? query.eq("driver_profile_id", notification.driver_profile_id)
      : query.eq("person_id", "none");
  const subscriptions = await query;
  if (subscriptions.error) throw subscriptions.error;
  let accepted = 0; let failed = 0;
  for (const subscription of subscriptions.data ?? []) {
    const existing = await service.from("sms_delivery_attempts")
      .select("sms_delivery_attempt_id,status,attempt_count")
      .eq("notification_id", notification.notification_id)
      .eq("sms_subscription_id", subscription.sms_subscription_id).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data?.status === "accepted") continue;
    const attempt = existing.data ?? (await service.from("sms_delivery_attempts").insert({
      tenant_id: notification.tenant_id, notification_id: notification.notification_id,
      sms_subscription_id: subscription.sms_subscription_id,
    }).select("sms_delivery_attempt_id,status,attempt_count").single()).data;
    if (!attempt) continue;
    const attemptCount = (attempt.attempt_count ?? 0) + 1;
    try {
      const form = new URLSearchParams({ To: subscription.phone_e164, Body: body,
        MessagingServiceSid: config.twilio.messagingServiceSid });
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilio.accountSid)}/Messages.json`, {
        method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded" }, body: form,
      });
      const result = await response.json() as { sid?: string; status?: string; message?: string };
      if (!response.ok || !result.sid) throw new Error(result.message ?? "SMS provider rejected the message.");
      await service.from("sms_delivery_attempts").update({ status: "accepted", attempt_count: attemptCount,
        provider_message_id: result.sid, provider_status: result.status ?? "accepted",
        delivered_at: new Date().toISOString(), failure_message: null })
        .eq("sms_delivery_attempt_id", attempt.sms_delivery_attempt_id);
      accepted += 1;
    } catch (error) {
      await service.from("sms_delivery_attempts").update({ status: "failed", attempt_count: attemptCount,
        failure_message: error instanceof Error ? error.message.slice(0, 500) : "SMS delivery failed." })
        .eq("sms_delivery_attempt_id", attempt.sms_delivery_attempt_id);
      failed += 1;
    }
  }
  return { accepted, failed, skipped: false };
}
