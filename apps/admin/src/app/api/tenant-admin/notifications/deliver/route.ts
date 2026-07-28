import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { getAdminServerConfig } from "@/lib/config";
import { deliverQueuedNotifications } from "@/lib/notifications/delivery";
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
    const config = getAdminServerConfig();
    const { sent, failed } = await deliverQueuedNotifications(service, config, {
      tenantId,
      ...(notificationId ? { notificationId } : {}),
      limit: 10,
    });

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
