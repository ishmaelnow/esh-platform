import type { AdminServerConfig } from "@/lib/config";

export type NotificationEmail = {
  notificationId: string;
  notificationType: string;
  recipientEmail: string;
  payload: Record<string, unknown>;
};

export async function sendNotificationEmail(
  config: AdminServerConfig,
  notification: NotificationEmail,
) {
  const content = notification.notificationType.startsWith("rider_")
    ? buildRiderNotificationContent(
        notification.notificationType,
        notification.payload,
        config.redirects.riderAppUrl,
      )
    : buildDriverNotificationContent(
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
  const expiresOn = textValue(payload.expires_on);
  const serviceAreaName = textValue(payload.service_area_name);
  const pickupAddress = textValue(payload.pickup_address);
  const destinationAddress = textValue(payload.destination_address);
  const offerExpiresAt = textValue(payload.expires_at);
  const amount = moneyValue(payload.amount_minor, payload.currency_code);
  const expectedArrivalAt = textValue(payload.expected_arrival_at);
  const failureMessage = textValue(payload.failure_message);
  const financialNotification = notificationType.startsWith("driver_earnings_")
    || notificationType.startsWith("driver_transfer_")
    || notificationType.startsWith("driver_bank_payout_");
  const portalUrlValue = new URL("/", driverAppUrl);
  if (financialNotification) portalUrlValue.searchParams.set("view", "earnings");
  const portalUrl = portalUrlValue.toString();
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
    driver_evidence_expiring_30d: {
      subject: `Your ${evidenceType} expires soon`,
      intro: `${driverName}, your ${evidenceType} expires within 30 days.`,
      ...(expiresOn ? { detail: `Expiration date: ${expiresOn}` } : {}),
    },
    driver_evidence_expiring_7d: {
      subject: `Your ${evidenceType} expires within 7 days`,
      intro: `${driverName}, your ${evidenceType} expires within 7 days.`,
      ...(expiresOn ? { detail: `Expiration date: ${expiresOn}` } : {}),
    },
    driver_evidence_expired: {
      subject: `Your ${evidenceType} has expired`,
      intro: `${driverName}, your ${evidenceType} has expired and requires replacement.`,
      ...(expiresOn ? { detail: `Expiration date: ${expiresOn}` } : {}),
    },
    driver_activated: {
      subject: "Your ESH driver profile is active",
      intro: `${driverName}, your driver profile is now active.`,
    },
    vehicle_evidence_approved: {
      subject: `Your vehicle ${evidenceType} was approved`,
      intro: `${driverName}, your assigned vehicle's ${evidenceType} has been approved.`,
    },
    vehicle_evidence_rejected: {
      subject: `Action required for your vehicle ${evidenceType}`,
      intro: `${driverName}, your assigned vehicle's ${evidenceType} needs a replacement.`,
      ...(reviewNotes ? { detail: `Review note: ${reviewNotes}` } : {}),
    },
    vehicle_evidence_expiring_30d: {
      subject: `Your vehicle ${evidenceType} expires soon`,
      intro: `${driverName}, your assigned vehicle's ${evidenceType} expires within 30 days.`,
      ...(expiresOn ? { detail: `Expiration date: ${expiresOn}` } : {}),
    },
    vehicle_evidence_expiring_7d: {
      subject: `Your vehicle ${evidenceType} expires within 7 days`,
      intro: `${driverName}, your assigned vehicle's ${evidenceType} expires within 7 days.`,
      ...(expiresOn ? { detail: `Expiration date: ${expiresOn}` } : {}),
    },
    vehicle_evidence_expired: {
      subject: `Your vehicle ${evidenceType} has expired`,
      intro: `${driverName}, your assigned vehicle's ${evidenceType} has expired and requires replacement.`,
      ...(expiresOn ? { detail: `Expiration date: ${expiresOn}` } : {}),
    },
    dispatch_offer_created: {
      subject: "New trip offer",
      intro: `${driverName}, you have a new trip offer${
        serviceAreaName ? ` in ${serviceAreaName}` : ""
      }.`,
      detail: [
        pickupAddress ? `Pickup: ${pickupAddress}` : "",
        destinationAddress ? `Destination: ${destinationAddress}` : "",
        offerExpiresAt ? `Respond before: ${offerExpiresAt}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
    driver_earnings_recorded: {
      subject: "Your trip earnings were recorded",
      intro: `${driverName}, ${amount || "your earnings"} from a completed trip were added to your ESH wallet.`,
      detail: [pickupAddress ? `Pickup: ${pickupAddress}` : "", destinationAddress ? `Destination: ${destinationAddress}` : ""].filter(Boolean).join("\n"),
    },
    driver_transfer_succeeded: {
      subject: "Your earnings were transferred to Stripe",
      intro: `${driverName}, ${amount || "your earnings"} were transferred to your Stripe balance.`,
      detail: [pickupAddress ? `Pickup: ${pickupAddress}` : "", destinationAddress ? `Destination: ${destinationAddress}` : ""].filter(Boolean).join("\n"),
    },
    driver_bank_payout_created: {
      subject: "Stripe started your bank payout",
      intro: `${driverName}, Stripe started a bank payout${amount ? ` for ${amount}` : ""}.`,
      ...(expectedArrivalAt ? { detail: `Expected arrival: ${formatDateTime(expectedArrivalAt)}` } : {}),
    },
    driver_bank_payout_paid: {
      subject: "Your Stripe bank payout was paid",
      intro: `${driverName}, Stripe marked your bank payout${amount ? ` for ${amount}` : ""} as paid.`,
    },
    driver_bank_payout_failed: {
      subject: "Action needed for your Stripe bank payout",
      intro: `${driverName}, Stripe reported that your bank payout${amount ? ` for ${amount}` : ""} failed.`,
      ...(failureMessage ? { detail: `Reason: ${failureMessage}` } : {}),
    },
  };
  const message = messages[notificationType];
  if (!message) throw new Error("Unsupported driver notification type.");

  const portalLabel = financialNotification ? "View your earnings:" : "Open the Driver portal:";
  const lines = [message.intro, message.detail, "", portalLabel, portalUrl].filter(
    (line): line is string => line !== undefined,
  );
  return {
    subject: message.subject,
    text: lines.join("\n"),
    html: [
      `<p>${escapeHtml(message.intro)}</p>`,
      message.detail ? `<p>${escapeHtml(message.detail)}</p>` : "",
      `<p><a href="${escapeHtml(portalUrl)}">${financialNotification ? "View earnings" : "Open Driver portal"}</a></p>`,
    ].join(""),
  };
}

export function buildRiderNotificationContent(
  notificationType: string,
  payload: Record<string, unknown>,
  riderAppUrl: string,
) {
  const riderName = textValue(payload.rider_name) || "Rider";
  const pickupAddress = textValue(payload.pickup_address);
  const destinationAddress = textValue(payload.destination_address);
  const driverName = textValue(payload.driver_name);
  const driverNumber = textValue(payload.driver_number);
  const vehicleDescription = textValue(payload.vehicle_description);
  const scheduledPickupAt = textValue(payload.scheduled_pickup_at);
  const tenantTimeZone = textValue(payload.tenant_time_zone) || "UTC";
  const scheduledPickup = scheduledPickupAt
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: tenantTimeZone,
      }).format(new Date(scheduledPickupAt))
    : "";
  const tenantSlug = textValue(payload.tenant_slug);
  const amount = moneyValue(payload.amount_minor, payload.currency_code);
  const financialNotification = notificationType === "rider_payment_succeeded"
    || notificationType === "rider_refund_succeeded"
    || notificationType.startsWith("rider_recurring_autopay_");
  const portalUrl = new URL("/", riderAppUrl);
  if (tenantSlug) portalUrl.searchParams.set("tenant", tenantSlug);
  if (financialNotification) portalUrl.searchParams.set("view", "payments");
  const messages: Record<string, { subject: string; intro: string; details?: string[] }> = {
    rider_booking_created: {
      subject: "Your trip request was received",
      intro: `${riderName}, your trip request was received and dispatch can now find a driver.`,
    },
    rider_booking_scheduled: {
      subject: "Your scheduled trip is confirmed",
      intro: `${riderName}, your future trip has been scheduled.`,
      details: scheduledPickup ? [`Pickup time: ${scheduledPickup} (${tenantTimeZone})`] : [],
    },
    rider_scheduled_reminder: {
      subject: "Reminder: your scheduled trip is coming up",
      intro: `${riderName}, this is a reminder about your upcoming trip.`,
      details: scheduledPickup ? [`Pickup time: ${scheduledPickup} (${tenantTimeZone})`] : [],
    },
    rider_scheduled_dispatch_started: {
      subject: "We are finding a driver for your scheduled trip",
      intro: `${riderName}, dispatch has started finding an eligible driver for your scheduled trip.`,
      details: scheduledPickup ? [`Scheduled pickup: ${scheduledPickup} (${tenantTimeZone})`] : [],
    },
    rider_dispatch_searching: {
      subject: "We are still finding your driver",
      intro: `${riderName}, the previous offer expired or was declined. Dispatch is continuing to find an eligible driver.`,
    },
    rider_driver_accepted: {
      subject: "Your driver accepted the trip",
      intro: `${riderName}, a driver accepted your trip.`,
      details: [
        driverName ? `Driver: ${driverName}${driverNumber ? ` (#${driverNumber})` : ""}` : "",
        vehicleDescription ? `Vehicle: ${vehicleDescription}` : "",
      ],
    },
    rider_driver_arrived: {
      subject: "Your driver has arrived",
      intro: `${riderName}, your driver has arrived at the pickup location.`,
    },
    rider_trip_started: {
      subject: "Your trip has started",
      intro: `${riderName}, your trip is now in progress.`,
    },
    rider_trip_completed: {
      subject: "Your trip is complete",
      intro: `${riderName}, your trip has been completed.`,
    },
    rider_booking_cancelled: {
      subject: "Your trip was cancelled",
      intro: `${riderName}, your trip booking has been cancelled.`,
    },
    rider_payment_succeeded: {
      subject: "Your ESH trip payment was confirmed",
      intro: `${riderName}, your payment${amount ? ` of ${amount}` : ""} was confirmed.`,
    },
    rider_refund_succeeded: {
      subject: "Your ESH trip refund was issued",
      intro: `${riderName}, your refund${amount ? ` of ${amount}` : ""} was issued to the original payment method.`,
    },
    rider_recurring_autopay_succeeded: {
      subject: "Your recurring ESH trip was paid and scheduled",
      intro: `${riderName}, automatic payment succeeded and your recurring trip is scheduled.`,
      details: scheduledPickup ? [`Pickup time: ${scheduledPickup} (${tenantTimeZone})`] : [],
    },
    rider_recurring_autopay_failed: {
      subject: "Action needed for your recurring ESH trip",
      intro: `${riderName}, we could not automatically pay for your upcoming recurring trip. Open ESH to review the fare and pay manually.`,
      details: scheduledPickup ? [`Pickup time: ${scheduledPickup} (${tenantTimeZone})`] : [],
    },
  };
  const message = messages[notificationType];
  if (!message) throw new Error("Unsupported rider notification type.");
  const details = [
    pickupAddress ? `Pickup: ${pickupAddress}` : "",
    destinationAddress ? `Destination: ${destinationAddress}` : "",
    ...(message.details ?? []),
  ].filter(Boolean);
  const link = portalUrl.toString();
  return {
    subject: message.subject,
    text: [message.intro, ...details, "", financialNotification ? "View your payments:" : "View your trip:", link].join("\n"),
    html: [
      `<p>${escapeHtml(message.intro)}</p>`,
      ...details.map((detail) => `<p>${escapeHtml(detail)}</p>`),
      `<p><a href="${escapeHtml(link)}">${financialNotification ? "View payments" : "View your trip"}</a></p>`,
    ].join(""),
  };
}

function textValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function moneyValue(amount: unknown, currency: unknown) {
  const amountMinor = typeof amount === "number" ? amount : Number(amount);
  const currencyCode = textValue(currency).toUpperCase();
  if (!Number.isFinite(amountMinor) || !currencyCode) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currencyCode }).format(amountMinor / 100);
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
