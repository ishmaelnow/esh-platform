import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getInvitationDeliveryUpdate,
  getNotificationDeliveryUpdate,
  verifyResendWebhook,
} from "./resend-webhook";

describe("Resend invitation webhooks", () => {
  it("verifies a signed raw payload", () => {
    const secretValue = Buffer.from("test signing secret").toString("base64");
    const secret = `whsec_${secretValue}`;
    const timestamp = "1700000000";
    const id = "msg_test";
    const payload = JSON.stringify({ type: "email.delivered", created_at: "2026-01-01", data: {} });
    const signature = createHmac("sha256", Buffer.from(secretValue, "base64"))
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64");

    expect(
      verifyResendWebhook(
        payload,
        { id, timestamp, signature: `v1,${signature}` },
        secret,
        1700000000000,
      ),
    ).toMatchObject({ type: "email.delivered" });
  });

  it("maps delivered events to confirmed delivery", () => {
    expect(
      getInvitationDeliveryUpdate({
        type: "email.delivered",
        created_at: "2026-07-14T20:00:00Z",
        data: { tags: { invitation_id: "invitation-id" } },
      }),
    ).toEqual({
      invitationId: "invitation-id",
      status: "sent",
      deliveredAt: "2026-07-14T20:00:00Z",
      error: null,
    });
  });

  it("maps bounced events to failed delivery", () => {
    expect(
      getInvitationDeliveryUpdate({
        type: "email.bounced",
        created_at: "2026-07-14T20:00:00Z",
        data: { tags: { invitation_id: "invitation-id" } },
      }),
    ).toMatchObject({ status: "failed", deliveredAt: null });
  });

  it("maps notification delivery using its unique tag", () => {
    expect(
      getNotificationDeliveryUpdate({
        type: "email.delivered",
        created_at: "2026-07-27T20:00:00Z",
        data: { tags: { notification_id: "notification-id" } },
      }),
    ).toEqual({
      notificationId: "notification-id",
      status: "delivered",
      deliveredAt: "2026-07-27T20:00:00Z",
      error: null,
    });
  });
});
