import { describe, expect, it } from "vitest";
import {
  buildCommunityInvitationSignInRedirect,
  communityInvitationAction,
} from "./approval";

describe("Community membership approval invitation recovery", () => {
  it("returns passwordless sign-in to automatic Community invitation acceptance", () => {
    expect(buildCommunityInvitationSignInRedirect("https://admin.eshapp.com", "raw token")).toBe(
      "https://admin.eshapp.com/invite/accept?token=raw+token&product=community&auto_accept=1",
    );
  });

  it("creates an invitation when approval has none", () => {
    expect(communityInvitationAction(null)).toBe("create");
  });

  it("reuses a delivered pending Community invitation", () => {
    expect(
      communityInvitationAction({
        emailDeliveryStatus: "sent",
        workspaceKey: "community",
        workspaceRoleKey: "community_member",
      }),
    ).toBe("reuse");
  });

  it("rotates the token when a Community invitation email was not delivered", () => {
    expect(
      communityInvitationAction({
        emailDeliveryStatus: "failed",
        workspaceKey: "community",
        workspaceRoleKey: "community_member",
      }),
    ).toBe("refresh");
  });

  it("does not convert a pending foundation invitation into Community access", () => {
    expect(() =>
      communityInvitationAction({
        emailDeliveryStatus: "sent",
        workspaceKey: null,
        workspaceRoleKey: null,
      }),
    ).toThrow("pending non-Community tenant invitation");
  });
});
