export type PendingInvitationContext = {
  emailDeliveryStatus: string;
  workspaceKey: string | null;
  workspaceRoleKey: string | null;
};

export type CommunityInvitationAction = "create" | "refresh" | "reuse";

export function communityInvitationAction(
  invitation: PendingInvitationContext | null,
): CommunityInvitationAction {
  if (!invitation) return "create";
  if (
    invitation.workspaceKey !== "community"
    || invitation.workspaceRoleKey !== "community_member"
  ) {
    throw new Error("This email already has a pending non-Community tenant invitation.");
  }
  return invitation.emailDeliveryStatus === "sent" ? "reuse" : "refresh";
}
