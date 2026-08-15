export function normalizeE164(value: string) {
  const normalized = value.replace(/[\s().-]/g, "");
  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized))
    throw new Error("Enter a mobile number in international format, such as +12155550123.");
  return normalized;
}

export async function requestTwilioVerification(phone: string) {
  return twilioVerifyRequest("Verifications", new URLSearchParams({ To: phone, Channel: "sms" }));
}

export async function checkTwilioVerification(phone: string, code: string) {
  return twilioVerifyRequest("VerificationCheck", new URLSearchParams({ To: phone, Code: code }));
}

async function twilioVerifyRequest(resource: string, body: URLSearchParams) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) throw new Error("SMS verification is not configured.");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/${resource}`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded" }, body,
  });
  const result = await response.json() as { status?: string; message?: string };
  if (!response.ok) throw new Error(result.message ?? "SMS verification failed.");
  return result.status ?? "pending";
}
