import type { PlatformSupabaseClient } from "@esh-platform/supabase";
import type { AdminServerConfig } from "@/lib/config";
import { sendDriverNotificationEmail } from "./email";

export type DeliveryScope = {
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
  const { data: notifications, error: readError } = await query;
  if (readError) throw readError;

  let sent = 0;
  let failed = 0;
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
      .select("notification_id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) continue;

    try {
      const result = await sendDriverNotificationEmail(config, {
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

  return { sent, failed };
}
