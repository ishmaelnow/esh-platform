import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { NextResponse } from "next/server";
import { getAdminServerConfig } from "@/lib/config";
import {
  getInvitationDeliveryUpdate,
  getNotificationDeliveryUpdate,
  verifyResendWebhook,
} from "@/lib/invitations/resend-webhook";

export async function POST(request: Request) {
  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!id || !timestamp || !signature) {
    return NextResponse.json({ message: "Missing webhook signature headers." }, { status: 400 });
  }

  try {
    const config = getAdminServerConfig();
    const event = verifyResendWebhook(
      payload,
      { id, timestamp, signature },
      config.resend.webhookSecret,
    );
    const update = getInvitationDeliveryUpdate(event);
    const notificationUpdate = getNotificationDeliveryUpdate(event);

    if (!update && !notificationUpdate) {
      return NextResponse.json({ ok: true });
    }

    const supabase = createServiceSupabaseClient();
    if (notificationUpdate) {
      const { data: current, error: readError } = await supabase
        .from("notification_outbox")
        .select("delivery_status")
        .eq("notification_id", notificationUpdate.notificationId)
        .maybeSingle();
      if (readError) throw new Error(readError.message);
      if (!current || current.delivery_status === "delivered") {
        return NextResponse.json({ ok: true });
      }
      const { error } = await supabase
        .from("notification_outbox")
        .update({
          delivery_status: notificationUpdate.status,
          delivered_at: notificationUpdate.deliveredAt,
          delivery_error: notificationUpdate.error,
        })
        .eq("notification_id", notificationUpdate.notificationId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true });
    }

    if (!update) return NextResponse.json({ ok: true });
    const { data: invitation, error: readError } = await supabase
      .from("tenant_invitations")
      .select("email_delivery_status")
      .eq("invitation_id", update.invitationId)
      .maybeSingle();

    if (readError) {
      throw new Error(readError.message);
    }

    if (
      !invitation ||
      (update.status === "pending" && invitation.email_delivery_status === "sent")
    ) {
      return NextResponse.json({ ok: true });
    }

    const { error: updateError } = await supabase
      .from("tenant_invitations")
      .update({
        email_delivery_status: update.status,
        email_delivered_at: update.deliveredAt,
        email_delivery_error: update.error,
      })
      .eq("invitation_id", update.invitationId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Invalid or unprocessable webhook." }, { status: 400 });
  }
}
