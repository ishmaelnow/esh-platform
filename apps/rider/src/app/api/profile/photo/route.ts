import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { validateProfilePhoto } from "../../../../lib/profile-photo";

const bucketName = "rider-profile-photos";
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
class ProfileError extends Error { constructor(message: string, readonly status: number) { super(message); } }

async function owner(request: Request) {
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) throw new ProfileError("Sign in to manage your photo.", 401);
  const client = createAuthenticatedSupabaseClient(token.slice(7));
  const user = await client.auth.getUser();
  if (user.error || !user.data.user?.email_confirmed_at) throw new ProfileError("Verify your email to manage your photo.", 401);
  const slug = new URL(request.url).searchParams.get("tenantSlug");
  if (!slug || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw new ProfileError("Select your provider.", 400);
  const portal = await client.rpc("my_rider_portal", { target_tenant_slug: slug });
  const data = portal.data as { tenant?: { tenantId?: string }; profile?: { riderProfileId?: string; status?: string } } | null;
  if (portal.error) throw new ProfileError("Your profile could not be loaded.", 503);
  if (!data?.tenant?.tenantId || !data.profile?.riderProfileId || data.profile.status !== "active") {
    throw new ProfileError("An active rider profile is required.", 403);
  }
  return { client, slug, tenantId: data.tenant.tenantId, riderId: data.profile.riderProfileId };
}

function failure(error: unknown) {
  return error instanceof ProfileError ? reply({ message: error.message }, error.status)
    : reply({ message: "Your profile photo could not be updated. Refresh before trying again." }, 503);
}

export async function GET(request: Request) {
  try {
    const own = await owner(request);
    const result = await own.client.from("rider_profiles").select("photo_storage_path")
      .eq("tenant_id", own.tenantId).eq("rider_profile_id", own.riderId).single();
    if (result.error || !result.data) throw new ProfileError("Your photo could not be loaded.", 503);
    const path = result.data.photo_storage_path;
    if (!path) return reply({ url: null });
    if (!path.startsWith(`${own.tenantId}/${own.riderId}/`)) throw new ProfileError("Your photo could not be loaded.", 503);
    const signed = await createServiceSupabaseClient().storage.from(bucketName).createSignedUrl(path, 300);
    if (signed.error || !signed.data) throw new ProfileError("Your photo could not be loaded.", 503);
    return reply({ url: signed.data.signedUrl });
  } catch (error) { return failure(error); }
}

async function boundedForm(request: Request) {
  const maximum = 1_100_000;
  if (Number(request.headers.get("content-length")) > maximum) throw new ProfileError("Choose a photo up to 1 MB.", 413);
  const reader = request.body?.getReader();
  if (!reader || !request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new ProfileError("Choose a photo.", 400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > maximum) { await reader.cancel(); throw new ProfileError("Choose a photo up to 1 MB.", 413); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new Request(request.url, { method: "POST", headers: { "Content-Type": request.headers.get("content-type")! }, body: bytes }).formData();
}

export async function POST(request: Request) {
  try {
    const own = await owner(request);
    const form = await boundedForm(request);
    const file = form.get("photo");
    if (!(file instanceof File)) throw new ProfileError("Choose a JPEG or PNG photo.", 400);
    try { await validateProfilePhoto(file); } catch (error) {
      throw new ProfileError(error instanceof Error ? error.message : "Choose a valid photo.", 400);
    }
    const service = createServiceSupabaseClient();
    const storage = service.storage.from(bucketName);
    const path = `${own.tenantId}/${own.riderId}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
    const uploaded = await storage.upload(path, file, { upsert: false, contentType: file.type });
    if (uploaded.error) throw new ProfileError("Your photo could not be uploaded. Try again.", 503);
    // Once the RPC starts, a network error can hide a successful commit. Retain the candidate
    // on ambiguous failures; never delete a potentially current photo or expose/log its path.
    const saved = await own.client.rpc("set_my_rider_profile_photo", {
      target_tenant_slug: own.slug, storage_path_value: path, mime_type_value: file.type,
    });
    if (saved.error) throw new ProfileError("Photo status is uncertain. Refresh before trying again.", 503);
    const previous = saved.data as { previousPath?: string | null } | null;
    if (previous?.previousPath?.startsWith(`${own.tenantId}/${own.riderId}/`) && previous.previousPath !== path) {
      await storage.remove([previous.previousPath]).catch(() => undefined);
    }
    return reply({ saved: true });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    const own = await owner(request);
    const saved = await own.client.rpc("set_my_rider_profile_photo", {
      target_tenant_slug: own.slug, storage_path_value: null, mime_type_value: null,
    });
    if (saved.error) throw new ProfileError("Your photo could not be removed. Refresh before trying again.", 503);
    const previous = saved.data as { previousPath?: string | null } | null;
    if (previous?.previousPath?.startsWith(`${own.tenantId}/${own.riderId}/`)) {
      await createServiceSupabaseClient().storage.from(bucketName).remove([previous.previousPath]).catch(() => undefined);
    }
    return reply({ removed: true });
  } catch (error) { return failure(error); }
}
