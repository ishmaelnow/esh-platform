export type PendingInvitationContext = {
  emailDeliveryStatus: string;
  workspaceKey: string | null;
  workspaceRoleKey: string | null;
};

export type CommunityInvitationAction = "create" | "refresh" | "reuse";

export function buildCommunityInvitationSignInRedirect(communityAppUrl: string, token: string) {
  const url = new URL("/auth/callback", communityAppUrl);
  if (url.hostname === "community.eshapp.com") url.hostname = "app.community.eshapp.com";
  url.searchParams.set("invitation", token);
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
