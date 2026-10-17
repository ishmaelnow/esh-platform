import { NextResponse } from "next/server";
import {
  createAuthenticatedSupabaseClient,
  createServiceSupabaseClient,
  type Json,
} from "@esh-platform/supabase";
import { studentRoadRoute } from "@esh-platform/maps";
import { uuid } from "../../../../lib/geography";
import { jsonObject, planningStops } from "../../../../lib/planning";
const reply = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_STUDENT_ENROLLMENT_ENABLED !== "true")
    return reply({ message: "Planning unavailable." }, 503);
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") && request.headers.get("origin") !== origin)
    return reply({ message: "Request unavailable." }, 403);
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) return reply({ message: "Sign in again." }, 401);
  let body: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw Error();
    let size = 0;
    const parts: Uint8Array[] = [];
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 2048) {
          await reader.cancel();
          throw Error();
        }
        parts.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const p of parts) {
      bytes.set(p, offset);
      offset += p.length;
    }
    body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return reply({ message: "Choose a saved schedule revision." }, 400);
  }
  if (
    !jsonObject(body) ||
    !uuid(body.tenantId) ||
    !uuid(body.planId) ||
    !Number.isInteger(body.revision) ||
    Number(body.revision) < 1
  )
    return reply({ message: "Choose a saved schedule revision." }, 400);
  try {
    const client = createAuthenticatedSupabaseClient(bearer.slice(7));
    const auth = await client.auth.getUser();
    if (auth.error || !auth.data.user?.email_confirmed_at)
      return reply({ message: "Verified sign-in required." }, 401);
    const result = await client.rpc("student_route_plan_preview", {
      t: body.tenantId,
      id: body.planId,
      revision_value: Number(body.revision),
    });
    if (
      result.error ||
      !jsonObject(result.data) ||
      !uuid(result.data.customerId) ||
      typeof result.data.planHash !== "string"
    )
      return reply(
        { message: "Current internally reviewed schedule unavailable. Refresh planning." },
        403,
      );
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
      secret = process.env.NEXT_STUDENT_SUPABASE_SECRET_KEY;
    if (!token || !secret)
      return reply({ message: "Planning map configuration unavailable." }, 503);
    const stops = planningStops(result.data);
    const route = await studentRoadRoute(
      stops,
      token,
      AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
      origin,
    );
    const service = createServiceSupabaseClient({
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: secret,
    });
    const cleanup = await service
      .from("student_request_geography_receipts")
      .delete()
      .eq("auth_user_id", auth.data.user.id)
      .lt("expires_at", new Date().toISOString());
    if (cleanup.error) throw Error();
    const receipt = await service
      .from("student_request_geography_receipts")
      .insert({
        tenant_id: body.tenantId,
        customer_id: result.data.customerId,
        auth_user_id: auth.data.user.id,
        input_hash: result.data.planHash,
        payload: {
          kind: "planning",
          planId: body.planId,
          revision: body.revision,
          planHash: result.data.planHash,
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          verifiedAt: new Date().toISOString(),
        } as Json,
      })
      .select("receipt_id")
      .single();
    if (receipt.error || !receipt.data) throw Error();
    return reply({ receiptId: receipt.data.receipt_id, stops, route });
  } catch {
    return reply(
      { message: "Road preview unavailable. Check the reviewed loading points and try again." },
      503,
    );
  }
}
