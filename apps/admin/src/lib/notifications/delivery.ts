import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";
import { sendNotificationEmail } from "./email";
import { deliverNotificationPush } from "./push";
import { deliverNotificationSms } from "./sms";
import { deliverNativeNotifications } from "./native-push";

export type DeliveryScope = {
  skipNative?: boolean;
  notificationType?: "rider_support_update";
  notificationTypes?: ("rider_support_update" | "driver_support_update")[];
  tenantId?: string;
  notificationId?: string;
  limit?: number;
};

export async function deliverQueuedNotifications(
  service: PlatformSupabaseClient,
  config: AdminServerConfig,
  scope: DeliveryScope = {},
) {
  const now = new Date();
  const staleClaimThreshold = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  let recovery = service
    .from("notification_outbox")
    .update({
      delivery_status: "failed",
      delivery_error: "A previous delivery attempt was interrupted and can be retried.",
    })
    .eq("delivery_status", "sending")
    .lt("last_attempted_at", staleClaimThreshold);
  if (scope.tenantId) recovery = recovery.eq("tenant_id", scope.tenantId);
  if (scope.notificationType) recovery = recovery.eq("notification_type", scope.notificationType);
  if (scope.notificationTypes) recovery = recovery.in("notification_type", scope.notificationTypes);
  const { error: recoveryError } = await recovery;
  if (recoveryError) throw recoveryError;

  let query = service
    .from("notification_outbox")
    .select("*")
    .in("delivery_status", ["queued", "failed"])
    .lt("attempt_count", 5)
    .lte("available_at", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(scope.notificationId ? 1 : (scope.limit ?? 50));
  if (scope.tenantId) query = query.eq("tenant_id", scope.tenantId);
  if (scope.notificationId) query = query.eq("notification_id", scope.notificationId);
  if (scope.notificationType) query = query.eq("notification_type", scope.notificationType);
  if (scope.notificationTypes) query = query.in("notification_type", scope.notificationTypes);
  const { data: notifications, error: readError } = await query;
  if (readError) throw readError;

  let sent = 0;
  let failed = 0;
  let pushDelivered = 0;
  let pushFailed = 0;
  let smsAccepted = 0;
  let smsFailed = 0;
  let emailSkipped = 0;
  for (const notification of notifications ?? []) {
    const attemptedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await service
      .from("notification_outbox")
      .update({
        delivery_status: "sending",
        attempt_count: notification.attempt_count + 1,
        last_attempted_at: attemptedAt,
        delivery_error: null,
      })
      .eq("notification_id", notification.notification_id)
      .in("delivery_status", ["queued", "failed"])
      .select("notification_id,email_delivery_enabled")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    if (["driver_preorder_available", "rider_support_update", "driver_support_update"].includes(notification.notification_type)) {
      const current = await service.rpc(notification.notification_type === "rider_support_update" ? "support_alert_current"
        : notification.notification_type === "driver_support_update" ? "driver_support_alert_current" : "preorder_alert_current", { notification_value: notification.notification_id });
      if (current.error) throw current.error;
      if (!current.data) {
        const canceled = await service.from("notification_outbox").update({ delivery_status: "canceled",
          delivery_error: "Notification is no longer available to this recipient." }).eq("notification_id", notification.notification_id);
        if (canceled.error) throw canceled.error;
        continue;
      }
    }

    const push = await deliverNotificationPush(service, config, notification).catch(() => ({ delivered: 0, failed: 1, skipped: false }));
    pushDelivered += push.delivered;
    pushFailed += push.failed;
    const sms = await deliverNotificationSms(service, config, notification).catch(() => ({ accepted: 0, failed: 1, skipped: false }));
    smsAccepted += sms.accepted;
    smsFailed += sms.failed;

    if (claimed.email_delivery_enabled === false) {
      const { error: skippedError } = await service.from("notification_outbox").update({
        delivery_status: "email_disabled", delivery_error: "Email disabled by recipient preference.",
      }).eq("notification_id", notification.notification_id).eq("delivery_status", "sending");
      if (skippedError) throw skippedError;
      emailSkipped += 1;
      continue;
    }

    try {
      const result = await sendNotificationEmail(config, {
        notificationId: notification.notification_id,
        notificationType: notification.notification_type,
        recipientEmail: notification.recipient_email,
        payload: notification.payload as Record<string, unknown>,
      });
      const { error: updateError } = await service
        .from("notification_outbox")
        .update({
          delivery_status: "sent",
          provider_message_id: result.id,
          sent_at: new Date().toISOString(),
        })
        .eq("notification_id", notification.notification_id);
      if (updateError) throw updateError;
      sent += 1;
    } catch (error) {
      await service
        .from("notification_outbox")
        .update({
          delivery_status: "failed",
          delivery_error: error instanceof Error ? error.message : "Email delivery failed.",
        })
        .eq("notification_id", notification.notification_id);
      failed += 1;
    }
  }

  const native = scope.skipNative ? { nativeAccepted: 0, nativeFailed: 0, nativeSkipped: true } : await deliverNativeNotifications(service, config, scope)
    .catch(() => ({ nativeAccepted: 0, nativeFailed: 1, nativeSkipped: false }));
  return { sent, failed, emailSkipped, pushDelivered, pushFailed, smsAccepted, smsFailed, ...native };
}
