import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { getAdminServerConfig } from "@/lib/config";
import {
  buildCommunityInvitationSignInRedirect,
  communityInvitationAction,
} from "@/lib/community/approval";
import { deliverQueuedNotifications } from "@/lib/notifications/delivery";
import {
  createInvitationTokenPair,
  createRequestSupabaseClient,
  getBearerToken,
  normalizeEmail,
  validateTenantId,
} from "@/lib/tenant-admin/server";

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token)
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const requestId =
      typeof body.requestId === "string" && body.requestId && body.decision === "approved"
        ? validateTenantId(body.requestId)
        : null;
    const notificationId =
      typeof body.notificationId === "string" && body.notificationId
        ? validateTenantId(body.notificationId)
        : null;
    const authenticated = createRequestSupabaseClient({ accessToken: token });
    const { data: canManage, error: permissionError } = await authenticated.rpc(
      "can_manage_driver_management",
      { target_tenant_id: tenantId },
    );
    const { data: canModerateCommunity, error: communityPermissionError } = await authenticated.rpc(
      "has_workspace_role",
      {
        target_tenant_id: tenantId,
        target_workspace_key: "community",
        required_roles: ["community_admin", "community_moderator"],
      },
    );
    if (permissionError && communityPermissionError) {
      return NextResponse.json({ message: "Notification delivery authorization failed." }, { status: 403 });
    }
    if (!canManage && !canModerateCommunity) {
      return NextResponse.json(
        { message: "Community moderation or driver management permission is required." },
        { status: 403 },
      );
    }

    const service = createServiceSupabaseClient();
    const config = getAdminServerConfig();
    if (requestId) {
      if (!canModerateCommunity) {
        return NextResponse.json(
          { message: "Community moderation permission is required." },
          { status: 403 },
        );
      }

      const { data: requestSnapshot, error: requestError } = await authenticated.rpc(
        "community_join_review_snapshot",
        { target_tenant_id: tenantId, result_limit: 100 },
      );
      if (requestError) throw requestError;
      const joinRequest = parseJoinRequest(requestSnapshot, requestId);
      if (!joinRequest) throw new Error("Community membership request was not found.");
      if (joinRequest.status !== "pending" && joinRequest.status !== "approved") {
        throw new Error("Only pending or approved Community requests can create an invitation.");
      }

      const normalizedEmail = normalizeEmail(joinRequest.email);
      const { data: existingInvitation, error: existingInvitationError } = await service
        .from("tenant_invitations")
        .select("invitation_id,workspace_key,workspace_role_key,email_delivery_status")
        .eq("tenant_id", tenantId)
        .eq("normalized_email", normalizedEmail)
        .eq("status", "pending")
        .maybeSingle();
      if (existingInvitationError) throw existingInvitationError;
      const invitationAction = communityInvitationAction(
        existingInvitation
          ? {
              emailDeliveryStatus: existingInvitation.email_delivery_status,
              workspaceKey: existingInvitation.workspace_key,
              workspaceRoleKey: existingInvitation.workspace_role_key,
            }
          : null,
      );

      const { data: auth, error: authError } = await authenticated.auth.getUser();
      if (authError || !auth.user) throw authError ?? new Error("Authentication is required.");
      const { data: actor, error: actorError } = await authenticated
        .from("person_profiles")
        .select("person_id")
        .eq("auth_user_id", auth.user.id)
        .single();
      if (actorError) throw actorError;
      let invitationId = existingInvitation?.invitation_id ?? null;
      if (invitationAction !== "reuse") {
        const invitationToken = createInvitationTokenPair();
        if (invitationAction === "refresh" && existingInvitation) {
          const { error: refreshError } = await service
            .from("tenant_invitations")
            .update({
              invitation_token_hash: invitationToken.tokenHash,
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              email_delivery_status: "pending",
              email_delivery_attempted_at: new Date().toISOString(),
              email_delivered_at: null,
              email_delivery_error: null,
            })
            .eq("invitation_id", existingInvitation.invitation_id);
          if (refreshError) throw refreshError;
        } else {
          const { data: createdInvitation, error: invitationError } = await service
            .from("tenant_invitations")
            .insert({
              tenant_id: tenantId,
              email: joinRequest.email.trim(),
              normalized_email: normalizedEmail,
              intended_role: "tenant_member",
              invitation_token_hash: invitationToken.tokenHash,
              invited_by_person_id: actor.person_id,
              status: "pending",
              expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              workspace_key: "community",
              workspace_role_key: "community_member",
              email_delivery_status: "pending",
              email_delivery_attempted_at: new Date().toISOString(),
            })
            .select("invitation_id")
            .single();
          if (invitationError) throw invitationError;
          invitationId = createdInvitation.invitation_id;
        }

        try {
          const { error: signInError } = await service.auth.signInWithOtp({
            email: joinRequest.email,
            options: {
              emailRedirectTo: buildCommunityInvitationSignInRedirect(
                config.communityAppUrl,
                invitationToken.token,
              ),
              shouldCreateUser: true,
            },
          });
          if (signInError) throw signInError;
          const { error: deliveredError } = await service
            .from("tenant_invitations")
            .update({
              email_delivery_status: "sent",
              email_delivered_at: null,
              email_delivery_error: null,
            })
            .eq("invitation_id", invitationId as string);
          if (deliveredError) throw deliveredError;
        } catch (deliveryError) {
          await service
            .from("tenant_invitations")
            .update({
              email_delivery_status: "failed",
              email_delivery_error:
                deliveryError instanceof Error
                  ? deliveryError.message
                  : "Invitation email delivery failed.",
            })
            .eq("invitation_id", invitationId as string);
          throw deliveryError;
        }
      }

      if (joinRequest.status === "pending") {
        const { error: reviewError } = await authenticated.rpc("review_community_join_request", {
          target_request_id: requestId,
          decision_value: "approved",
        });
        if (reviewError) throw reviewError;
      }

      return NextResponse.json({
        ok: true,
        message: "Community sign-in link sent.",
        invitationId,
      });
    }

    const { sent, failed, pushDelivered, pushFailed, smsAccepted, smsFailed } = await deliverQueuedNotifications(service, config, {
      tenantId,
      ...(notificationId ? { notificationId } : {}),
      limit: 10,
    });

    return NextResponse.json({
      ok: true,
      message: `${sent} email${sent === 1 ? "" : "s"} sent; ${pushDelivered} push delivered; ${smsAccepted} text${smsAccepted === 1 ? "" : "s"} accepted; ${failed + pushFailed + smsFailed} channel attempt${failed + pushFailed + smsFailed === 1 ? "" : "s"} failed.`,
      sent,
      failed,
      pushDelivered,
      pushFailed,
      smsAccepted,
      smsFailed,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to deliver notifications." },
      { status: 400 },
    );
  }
}

function parseJoinRequest(value: unknown, requestId: string) {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    if (
      row.request_id === requestId
      && typeof row.email === "string"
      && typeof row.display_name === "string"
      && (row.status === "pending" || row.status === "approved")
    ) {
      return {
        displayName: row.display_name,
        email: row.email,
        status: row.status,
      };
    }
  }
  return null;
}
