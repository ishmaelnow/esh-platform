import type { AdminServerConfig } from "@/lib/config";

export type DriverNotification = {
  notificationId: string;
  notificationType: string;
  recipientEmail: string;
  payload: Record<string, unknown>;
};

export async function sendDriverNotificationEmail(
  config: AdminServerConfig,
  notification: DriverNotification,
) {
  const content = buildDriverNotificationContent(
    notification.notificationType,
    notification.payload,
    config.redirects.driverAppUrl,
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.resend.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.invitations.fromEmail,
      to: notification.recipientEmail,
      subject: content.subject,
      tags: [{ name: "notification_id", value: notification.notificationId }],
      text: content.text,
      html: content.html,
    }),
  });

  if (!response.ok) {
    const fallback = `${response.status} ${response.statusText}`.trim();
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      error?: string;
    } | null;
    throw new Error(payload?.message ?? payload?.error ?? fallback);
  }

  return (await response.json()) as { id: string };
}

export function buildDriverNotificationContent(
  notificationType: string,
  payload: Record<string, unknown>,
  driverAppUrl: string,
) {
  const driverName = textValue(payload.driver_name) || "Driver";
  const evidenceType = (textValue(payload.evidence_type) || "document").replaceAll("_", " ");
  const reviewNotes = textValue(payload.review_notes);
  const portalUrl = new URL("/", driverAppUrl).toString();
  const messages: Record<string, { subject: string; intro: string; detail?: string }> = {
    driver_account_ready: {
      subject: "Your ESH driver account is ready",
      intro: `${driverName}, your approved driver application is ready in the Driver portal.`,
    },
    driver_evidence_approved: {
      subject: `Your ${evidenceType} was approved`,
      intro: `${driverName}, your ${evidenceType} has been approved.`,
    },
    driver_evidence_rejected: {
      subject: `Action required for your ${evidenceType}`,
      intro: `${driverName}, your ${evidenceType} needs a replacement.`,
      ...(reviewNotes ? { detail: `Review note: ${reviewNotes}` } : {}),
    },
    driver_activated: {
      subject: "Your ESH driver profile is active",
      intro: `${driverName}, your driver profile is now active.`,
    },
  };
  const message = messages[notificationType];
  if (!message) throw new Error("Unsupported driver notification type.");

  const lines = [message.intro, message.detail, "", "Open the Driver portal:", portalUrl].filter(
    (line): line is string => line !== undefined,
  );
  return {
    subject: message.subject,
    text: lines.join("\n"),
    html: [
      `<p>${escapeHtml(message.intro)}</p>`,
      message.detail ? `<p>${escapeHtml(message.detail)}</p>` : "",
      `<p><a href="${escapeHtml(portalUrl)}">Open Driver portal</a></p>`,
    ].join(""),
  };
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
