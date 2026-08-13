export async function requestNotificationDelivery(tenantId: string) {
  const endpoint = process.env.NOTIFICATION_DELIVERY_URL;
  const secret = process.env.NOTIFICATION_DELIVERY_SECRET;
  if (!endpoint || !secret) return false;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-esh-notification-secret": secret },
      body: JSON.stringify({ tenantId }), cache: "no-store", signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch { return false; }
}
