import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { readSharedTrip, shareTokenPattern } from "../../../../lib/trip-share";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
export async function POST(request: Request) {
  let validated = false;
  try {
    const raw = await request.text();
    if (raw.length > 128) throw new Error("Unavailable");
    const token = (JSON.parse(raw) as { token?: unknown }).token;
    if (typeof token !== "string" || !shareTokenPattern.test(token)) throw new Error("Unavailable");
    validated = true;
    const result = await createServiceSupabaseClient().rpc("read_shared_trip", { hash_value: createHash("sha256").update(token).digest("hex") });
    if (result.error) return NextResponse.json({ message: "Trip updates are temporarily unavailable. Try again." }, { status: 503, headers });
    const trip = readSharedTrip(result.data);
    if (!trip || Date.parse(trip.expiresAt) <= Date.now()) return NextResponse.json({ message: "This trip link has ended, expired or been stopped." }, { status: 404, headers });
    return NextResponse.json(trip, { headers });
  } catch { return NextResponse.json({ message: validated ? "Trip updates are temporarily unavailable. Try again." : "This trip link has ended, expired or been stopped." }, { status: validated ? 503 : 404, headers }); }
}
