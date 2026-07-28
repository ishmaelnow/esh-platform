import { createHmac, timingSafeEqual } from "node:crypto";

const signatureToleranceSeconds = 5 * 60;

export type ResendEmailEvent = {
  type: string;
  created_at: string;
  data: {
    tags?: Record<string, string>;
  };
};

export function verifyResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
  now = Date.now(),
): ResendEmailEvent {
  const timestamp = Number(headers.timestamp);

  if (!Number.isInteger(timestamp)) {
    throw new Error("Invalid Resend webhook timestamp.");
  }

  if (Math.abs(now / 1000 - timestamp) > signatureToleranceSeconds) {
    throw new Error("Expired Resend webhook timestamp.");
  }

  const secretValue = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const signingKey = Buffer.from(secretValue, "base64");
  const expected = createHmac("sha256", signingKey)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest();
  const valid = headers.signature.split(" ").some((candidate) => {
    const encoded = candidate.startsWith("v1,") ? candidate.slice(3) : "";

    try {
      const actual = Buffer.from(encoded, "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    } catch {
      return false;
    }
  });

  if (!valid) {
    throw new Error("Invalid Resend webhook signature.");
  }

  return JSON.parse(payload) as ResendEmailEvent;
}

export function getInvitationDeliveryUpdate(event: ResendEmailEvent): {
  invitationId: string;
  status: "pending" | "sent" | "failed";
  deliveredAt: string | null;
  error: string | null;
} | null {
  const invitationId = event.data.tags?.invitation_id;

  if (!invitationId) {
    return null;
  }

  if (event.type === "email.delivered") {
    return {
      invitationId,
      status: "sent",
      deliveredAt: event.created_at,
      error: null,
    };
  }

  if (event.type === "email.delivery_delayed") {
    return {
      invitationId,
      status: "pending",
      deliveredAt: null,
      error: "Resend reported that delivery is delayed.",
    };
  }

  if (["email.bounced", "email.failed", "email.suppressed"].includes(event.type)) {
    return {
      invitationId,
      status: "failed",
      deliveredAt: null,
      error: `Resend reported ${event.type.replace("email.", "")}.`,
    };
  }

  return null;
}

export function getNotificationDeliveryUpdate(event: ResendEmailEvent): {
  notificationId: string;
  status: "sent" | "delivered" | "failed";
  deliveredAt: string | null;
  error: string | null;
} | null {
  const notificationId = event.data.tags?.notification_id;
  if (!notificationId) return null;
  if (event.type === "email.delivered") {
    return { notificationId, status: "delivered", deliveredAt: event.created_at, error: null };
  }
  if (event.type === "email.delivery_delayed") {
    return {
      notificationId,
      status: "sent",
      deliveredAt: null,
      error: "Resend reported that delivery is delayed.",
    };
  }
  if (["email.bounced", "email.failed", "email.suppressed"].includes(event.type)) {
    return {
      notificationId,
      status: "failed",
      deliveredAt: null,
      error: `Resend reported ${event.type.replace("email.", "")}.`,
    };
  }
  return null;
}
