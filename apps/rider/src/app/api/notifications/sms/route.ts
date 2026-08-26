import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { checkTwilioVerification, normalizeE164, requestTwilioVerification } from "../../../../lib/twilio-verify";

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("Authentication is required.");
    const authenticated = createAuthenticatedSupabaseClient(authorization.slice(7));
    const user = await authenticated.auth.getUser();
    if (user.error || !user.data.user) throw new Error("Authentication is required.");
    const body = await request.json() as { action?: string; phone?: string; code?: string; tenantSlug?: string };
    const phone = normalizeE164(body.phone ?? "");
    if (body.action === "start") {
      if (!body.tenantSlug) throw new Error("A valid tenant is required.");
      const settings = await authenticated.rpc("my_rider_sms_notification_settings", {
        target_tenant_slug: body.tenantSlug,
      });
      if (settings.error) throw settings.error;
      const consent = settings.data as {
        consented?: boolean;
        phoneE164?: string | null;
        status?: string;
      } | null;
      if (!consent?.consented || consent.status !== "consented_unverified" || consent.phoneE164 !== phone) {
        throw new Error("Save explicit SMS consent for this mobile number before requesting verification.");
      }
      await requestTwilioVerification(phone);
      return NextResponse.json({ pending: true });
    }
    if (body.action !== "check" || !/^\d{4,10}$/.test(body.code ?? "") || !body.tenantSlug)
      throw new Error("A valid verification code and tenant are required.");
    const status = await checkTwilioVerification(phone, body.code ?? "");
    if (status !== "approved") throw new Error("The verification code is invalid or expired.");
    const saved = await createServiceSupabaseClient().rpc("confirm_rider_sms_subscription_internal", {
      target_auth_user_id: user.data.user.id, target_tenant_slug: body.tenantSlug, phone_e164_value: phone,
    });
    if (saved.error) throw saved.error;
    return NextResponse.json({ enabled: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "SMS verification failed." }, { status: 400 });
  }
}
