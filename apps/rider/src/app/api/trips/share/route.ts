import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient } from "@esh-platform/supabase";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization", "Referrer-Policy": "no-referrer" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function manage(request: Request, action: "status" | "create" | "stop") {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return NextResponse.json({ message: "Sign in to manage trip sharing." }, { status: 401, headers });
  try {
    let bookingId: unknown;
    if (action === "status") bookingId = new URL(request.url).searchParams.get("bookingId");
    else { const raw = await request.text(); if (raw.length > 256) throw new Error("Invalid"); bookingId = (JSON.parse(raw) as { bookingId?: unknown }).bookingId; }
    if (typeof bookingId !== "string" || !uuid.test(bookingId)) return NextResponse.json({ message: "Choose your active trip." }, { status: 400, headers });
    const client = createAuthenticatedSupabaseClient(authorization.slice(7));
    const token = action === "create" ? randomBytes(32).toString("base64url") : null;
    const result = await client.rpc("manage_my_trip_share", { booking_value: bookingId, action_value: action,
      ...(token ? { hash_value: createHash("sha256").update(token).digest("hex") } : {}) });
    const state = result.data as { active?: boolean; expiresAt?: string } | null;
    if (result.error || !state || typeof state.active !== "boolean") throw new Error("Unavailable");
    return NextResponse.json({ active: state.active, expiresAt: state.expiresAt ?? null, ...(token && state.active ? { token } : {}) }, { headers });
  } catch { return NextResponse.json({ message: "Trip sharing could not be updated. Refresh and try again." }, { status: 400, headers }); }
}
export const GET = (request: Request) => manage(request, "status");
export const POST = (request: Request) => manage(request, "create");
export const DELETE = (request: Request) => manage(request, "stop");
