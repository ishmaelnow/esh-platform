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
    const body = await request.json() as { action?: string; phone?: string; code?: string };
    const phone = normalizeE164(body.phone ?? "");
    if (body.action === "start") {
      await requestTwilioVerification(phone);
      return NextResponse.json({ pending: true });
    }
    if (body.action !== "check" || !/^\d{4,10}$/.test(body.code ?? ""))
      throw new Error("A valid verification code is required.");
    const status = await checkTwilioVerification(phone, body.code ?? "");
    if (status !== "approved") throw new Error("The verification code is invalid or expired.");
    const saved = await createServiceSupabaseClient().rpc("confirm_driver_sms_subscription_internal", {
      target_auth_user_id: user.data.user.id, phone_e164_value: phone,
    });
    if (saved.error) throw saved.error;
    return NextResponse.json({ enabled: true });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "SMS verification failed." }, { status: 400 });
  }
}
