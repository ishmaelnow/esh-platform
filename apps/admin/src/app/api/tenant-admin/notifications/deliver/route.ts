import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { getAdminServerConfig } from "@/lib/config";
import { sendDriverNotificationEmail } from "@/lib/notifications/email";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantId,
} from "@/lib/tenant-admin/server";

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token)
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const notificationId =
      typeof body.notificationId === "string" && body.notificationId
        ? validateTenantId(body.notificationId)
        : null;
    const authenticated = createRequestSupabaseClient({ accessToken: token });
    const { data: canManage, error: permissionError } = await authenticated.rpc(
      "can_manage_driver_management",
      { target_tenant_id: tenantId },
    );
    if (permissionError || !canManage) {
      return NextResponse.json(
        { message: "Driver management permission is required." },
        { status: 403 },
      );
    }

    const service = createServiceSupabaseClient();
    const staleClaimThreshold = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { error: recoveryError } = await service
      .from("notification_outbox")
      .update({
        delivery_status: "failed",
        delivery_error: "A previous delivery attempt was interrupted and can be retried.",
      })
      .eq("tenant_id", tenantId)
      .eq("delivery_status", "sending")
      .lt("last_attempted_at", staleClaimThreshold);
    if (recoveryError) throw recoveryError;

    let query = service
      .from("notification_outbox")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("delivery_status", ["queued", "failed"])
      .lt("attempt_count", 5)
      .lte("available_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(notificationId ? 1 : 10);
    if (notificationId) query = query.eq("notification_id", notificationId);
    const { data: notifications, error: readError } = await query;
    if (readError) throw readError;

    const config = getAdminServerConfig();
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

    return NextResponse.json({
      ok: true,
      message: `${sent} notification${sent === 1 ? "" : "s"} sent; ${failed} failed.`,
      sent,
      failed,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to deliver notifications." },
      { status: 400 },
    );
  }
}
