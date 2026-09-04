export type PendingInvitationContext = {
  emailDeliveryStatus: string;
  workspaceKey: string | null;
  workspaceRoleKey: string | null;
};

export type CommunityInvitationAction = "create" | "refresh" | "reuse";

export function buildCommunityInvitationSignInRedirect(baseUrl: string, token: string) {
  const url = new URL("/invite/accept", baseUrl);
  url.searchParams.set("token", token);
  url.searchParams.set("product", "community");
  url.searchParams.set("auto_accept", "1");
  return url.toString();
}

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
