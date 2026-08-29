import { NextResponse } from "next/server";
import { getAdminServerConfig } from "@/lib/config";
import { sendTenantInvitationEmail } from "@/lib/invitations/email";
import {
  createInvitationTokenPair,
  createRequestSupabaseClient,
  getBearerToken,
  normalizeEmail,
  validateInvitationId,
  validateInvitationPayload,
  validateTenantId,
} from "@/lib/tenant-admin/server";

export async function POST(request: Request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    }

    const requestBody = (await request.json()) as { workspaceKey?: unknown; workspaceRoleKey?: unknown };
    const payload = validateInvitationPayload(requestBody);
    const workspaceKey = requestBody.workspaceKey === "community" ? "community" : null;
    const workspaceRoleKey = requestBody.workspaceRoleKey === "community_member" ? "community_member" : null;
    const config = getAdminServerConfig();
    const supabase = createRequestSupabaseClient({ accessToken });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    }

    const { data: person, error: personError } = await supabase
      .from("person_profiles")
      .select("person_id")
      .eq("auth_user_id", user.id)
      .single();

    if (personError) {
      return NextResponse.json({ message: personError.message }, { status: 403 });
    }

    const email = payload.email.trim();
    const { data: tenantConfiguration, error: tenantConfigurationError } = await supabase
      .from("tenant_configurations")
      .select("display_name")
      .eq("tenant_id", payload.tenantId)
      .single();

    if (tenantConfigurationError) {
      return NextResponse.json({ message: tenantConfigurationError.message }, { status: 403 });
    }

    const invitationToken = createInvitationTokenPair();
    const { data: invitation, error } = await supabase
      .from("tenant_invitations")
      .insert({
        tenant_id: payload.tenantId,
        email,
        normalized_email: normalizeEmail(email),
        intended_role: payload.role,
        invitation_token_hash: invitationToken.tokenHash,
        invited_by_person_id: person.person_id,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        workspace_key: workspaceKey,
        workspace_role_key: workspaceRoleKey,
      })
      .select("invitation_id")
      .single();

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    const attemptedAt = new Date().toISOString();
    await supabase
      .from("tenant_invitations")
      .update({
        email_delivery_status: "pending",
        email_delivery_attempted_at: attemptedAt,
        email_delivered_at: null,
        email_delivery_error: null,
      })
      .eq("invitation_id", invitation.invitation_id);

    try {
      await sendTenantInvitationEmail(config, {
        invitationId: invitation.invitation_id,
        toEmail: email,
        tenantDisplayName: tenantConfiguration.display_name,
        intendedRole: payload.role,
        token: invitationToken.token,
      });
    } catch (deliveryError) {
      const message = deliveryError instanceof Error
        ? deliveryError.message
        : "Invitation email delivery failed.";
      await supabase
        .from("tenant_invitations")
        .update({
          email_delivery_status: "failed",
          email_delivery_error: message,
        })
        .eq("invitation_id", invitation.invitation_id);
      return NextResponse.json({ message }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create invitation." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    }

    const body = (await request.json()) as unknown;

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
    }

    const tenantId = validateTenantId((body as { tenantId?: unknown }).tenantId);
    const invitationId = validateInvitationId((body as { invitationId?: unknown }).invitationId);
    const supabase = createRequestSupabaseClient({ accessToken });
    const { error } = await supabase
      .from("tenant_invitations")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("invitation_id", invitationId);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to cancel invitation." },
      { status: 400 },
    );
  }
}
