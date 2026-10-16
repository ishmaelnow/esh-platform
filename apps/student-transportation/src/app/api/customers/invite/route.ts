import { NextResponse } from "next/server";
import {
  createAuthenticatedSupabaseClient,
  createAnonymousSupabaseClient,
} from "@esh-platform/supabase";
const reply = (message: string, status = 200) =>
  NextResponse.json({ message }, { status, headers: { "Cache-Control": "no-store" } });
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error("Invalid body");
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 4096) {
        await reader.cancel();
        throw Error("Body too large");
      }
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid body");
  return value as Record<string, unknown>;
}
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED !== "true")
    return reply("Invitations are unavailable.", 503);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply("Request unavailable.", 403);
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) return reply("Please sign in.", 401);
  let body: Record<string, unknown>;
  try {
    body = await readBody(request);
  } catch {
    return reply("Check the customer details.", 400);
  }
  if (!uuid(body.target_tenant_id)) return reply("Choose your business.", 400);
  try {
    const staff = createAuthenticatedSupabaseClient(bearer.slice(7));
    const auth = await staff.auth.getUser();
    if (auth.error || !auth.data.user?.email_confirmed_at)
      return reply("Please verify your sign-in.", 401);
    let result;
    if (uuid(body.target_customer_id)) {
      result = await staff.rpc("prepare_student_customer_resend", {
        target_tenant_id: body.target_tenant_id,
        target_customer_id: body.target_customer_id,
      });
    } else {
      if (
        !uuid(body.request_id_value) ||
        typeof body.name_value !== "string" ||
        body.name_value.trim().length < 1 ||
        body.name_value.length > 160 ||
        typeof body.kind_value !== "string" ||
        !["school", "organization", "group"].includes(body.kind_value) ||
        typeof body.email_value !== "string" ||
        body.email_value.length > 254
      )
        return reply("Check the customer details.", 400);
      result = await staff.rpc("prepare_student_customer_invitation", {
        target_tenant_id: body.target_tenant_id,
        request_id_value: body.request_id_value,
        name_value: body.name_value,
        kind_value: body.kind_value,
        email_value: body.email_value,
      });
    }
    if (result.error)
      return reply(
        "Invitation could not be prepared. Check your permissions and customer details.",
        403,
      );
    const value = result.data;
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      typeof value.email !== "string"
    )
      return reply("Invitation is temporarily unavailable.", 503);
    if (value.sendAllowed !== true)
      return reply(
        "The account is saved. Wait one minute before requesting another invitation email.",
        429,
      );
    const provider = createAnonymousSupabaseClient();
    const sent = await provider.auth.signInWithOtp({
      email: value.email,
      options: { shouldCreateUser: true, emailRedirectTo: "https://school.eshapp.com/school" },
    });
    if (sent.error)
      return reply(
        "The account is saved, but the invitation email could not be sent. Use Resend invitation after one minute.",
        502,
      );
    return reply(
      "Invitation email requested. The school contact can verify their email to open their customer account.",
    );
  } catch {
    return reply(
      "Invitation is temporarily unavailable. Refresh the account list before retrying.",
      503,
    );
  }
}
