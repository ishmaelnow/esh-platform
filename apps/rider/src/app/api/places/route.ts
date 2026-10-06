import { NextResponse } from "next/server";
import { geocodePermanentAddress, validCoordinates } from "@esh-platform/maps";
import { createAuthenticatedSupabaseClient } from "@esh-platform/supabase";

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
class PlaceError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function boundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new PlaceError("Choose an address.", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 4096) { await reader.cancel(); throw new PlaceError("Address request is too large.", 413); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data: unknown;
  try { data = JSON.parse(new TextDecoder().decode(bytes)) as unknown; } catch { throw new PlaceError("Choose a valid address.", 400); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new PlaceError("Choose a valid address.", 400);
  return data as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization");
    if (!token?.startsWith("Bearer ")) throw new PlaceError("Sign in to save an address.", 401);
    const client = createAuthenticatedSupabaseClient(token.slice(7));
    const user = await client.auth.getUser();
    if (user.error || !user.data.user?.email_confirmed_at) throw new PlaceError("Verify your email to save an address.", 401);
    const body = await boundedJson(request);
    if (typeof body.tenantSlug !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(body.tenantSlug)
      || typeof body.riderProfileId !== "string" || (body.key !== "home" && body.key !== "work")
      || typeof body.label !== "string" || !body.label.trim() || body.label.length > 500
      || !validCoordinates(body.latitude, body.longitude)) throw new PlaceError("Choose a complete address from the suggestions.", 400);
    const portal = await client.rpc("my_rider_portal", { target_tenant_slug: body.tenantSlug });
    const profile = (portal.data as { profile?: { riderProfileId?: string; status?: string } } | null)?.profile;
    if (portal.error) throw new PlaceError("Your profile could not be loaded. Try again.", 503);
    if (!profile || profile.status !== "active" || profile.riderProfileId !== body.riderProfileId)
      throw new PlaceError("Your account changed. Refresh before saving.", 403);
    const accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!accessToken) throw new PlaceError("Address verification is temporarily unavailable.", 503);
    // Search Box coordinates are temporary hints. Persist only permanent geocoding results.
    let address;
    try {
      address = await geocodePermanentAddress(body.label.trim(), accessToken, {
        latitude: body.latitude, longitude: body.longitude as number, maxDistanceKm: 2,
        requireVerifiedAddress: true, requestOrigin: request.headers.get("origin") ?? undefined,
      });
    } catch { throw new PlaceError("Choose a complete street address near your selected location and try again.", 422); }
    if (!validCoordinates(address.latitude, address.longitude)) throw new PlaceError("Address verification is temporarily unavailable.", 503);
    const saved = await client.rpc("save_my_rider_place", {
      target_tenant_slug: body.tenantSlug, expected_rider_profile_id: body.riderProfileId,
      place_key_value: body.key, address_label_value: address.formattedAddress,
      latitude_value: address.latitude, longitude_value: address.longitude,
    });
    if (saved.error) throw new PlaceError("Save status is uncertain. Refresh saved addresses before retrying.", 503);
    return reply({ saved: true });
  } catch (error) {
    return error instanceof PlaceError ? reply({ message: error.message }, error.status)
      : reply({ message: "Your address could not be saved. Refresh before retrying." }, 503);
  }
}
