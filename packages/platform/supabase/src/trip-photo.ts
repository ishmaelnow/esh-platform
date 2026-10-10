import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;
export async function tripPhotoResponse(request: Request, role: "rider" | "driver", clients: {
  authenticated: (token: string) => Client; service: () => Client;
}): Promise<Response> {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ") || !auth.slice(7).trim()) return reply({ message: "Sign in to view this ride." }, 401);
    const booking = new URL(request.url).searchParams.get("bookingId");
    if (!booking || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(booking)) return reply({ message: "Select an active ride." }, 400);
    const client = clients.authenticated(auth.slice(7));
    const user = await client.auth.getUser();
    if (user.error || !user.data.user?.email_confirmed_at) return reply({ message: "A verified session is required." }, 401);
    const args = { booking_value: booking, role_value: role };
    const result = await client.rpc("my_trip_participant_photo", args);
    if (result.error || !result.data) return reply({ message: "Photo unavailable for this ride." }, 403);
    const data = result.data as { photo?: { bucket?: string; path?: string } | null; tenant?: string; rider?: string };
    if (!data.photo) return reply({ url: null });
    const bucket = role === "rider" ? "driver-application-files" : "rider-profile-photos";
    const path = data.photo.path;
    const prefix = role === "rider" ? `${data.tenant}/` : `${data.tenant}/${data.rider}/`;
    if (!data.tenant || !data.rider || data.photo.bucket !== bucket || !path?.startsWith(prefix)
      || path.split("/").some((part) => !part || part === "." || part === "..")) return reply({ url: null });
    const signed = await clients.service().storage.from(bucket).createSignedUrl(path, 60);
    if (signed.error || !signed.data?.signedUrl) return reply({ url: null });
    // Reject assignment/lifecycle/photo changes that happened while storage was signing.
    const current = await client.rpc("my_trip_participant_photo", args);
    if (current.error || JSON.stringify(current.data) !== JSON.stringify(result.data)) return reply({ url: null });
    return reply({ url: signed.data.signedUrl, expiresIn: 60 });
  } catch { return reply({ url: null }, 503); }
}
