import { NextResponse } from "next/server";
import { createAuthenticatedSupabaseClient, createServiceSupabaseClient } from "@esh-platform/supabase";
import { applicationFiles } from "../../../lib/application";

const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const fail = (message: string, status: number) => NextResponse.json({ message }, { status, headers });
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ") || !authorization.slice(7).trim()) return fail("Sign in to view your document.", 401);
    const client = createAuthenticatedSupabaseClient(authorization.slice(7));
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email_confirmed_at) return fail("A verified session is required.", 401);
    const body = await request.json() as { evidenceType?: string; applicationId?: string };
    if (!applicationFiles.some((file) => file.type === body.evidenceType)) return fail("Document type is unavailable.", 400);

    // Derive ownership through existing own-only RPCs before using privileged storage access.
    let applicationId: string | null = null;
    let driverProfileId: string | null = null;
    if (body.applicationId) {
      const own = await client.rpc("my_driver_applications");
      if (own.error) return fail("Document service is unavailable. Try again.", 503);
      if (!Array.isArray(own.data) || !own.data.some((item) =>
        typeof item === "object" && item !== null && "applicationId" in item && item.applicationId === body.applicationId,
      )) return fail("Document not found.", 404);
      applicationId = body.applicationId;
    } else {
      const own = await client.rpc("my_driver_portal_summary");
      if (own.error) return fail("Document service is unavailable. Try again.", 503);
      const summary = own.data as { driverProfileId?: unknown } | null;
      if (typeof summary?.driverProfileId !== "string") return fail("Document not found.", 404);
      driverProfileId = summary.driverProfileId;
    }
    const service = createServiceSupabaseClient();
    // Tenant is also derived from the owned record, never accepted from the request.
    const owner = applicationId
      ? await service.from("driver_applications").select("tenant_id").eq("driver_application_id", applicationId).single()
      : await service.from("driver_profiles").select("tenant_id").eq("driver_profile_id", driverProfileId!).single();
    if (owner.error || !owner.data) return fail("Document not found.", 404);
    let query = service.from("driver_evidence").select("storage_bucket,storage_path,original_file_name,mime_type")
      .eq("tenant_id", owner.data.tenant_id).eq("evidence_type", body.evidenceType!);
    query = applicationId ? query.eq("driver_application_id", applicationId) : query.eq("driver_profile_id", driverProfileId!);
    const evidence = await query.order("submitted_at", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (evidence.error || !evidence.data) return fail("Document not found.", 404);
    const file = evidence.data;
    const signed = await service.storage.from(file.storage_bucket).createSignedUrl(file.storage_path, 300);
    if (signed.error || !signed.data?.signedUrl) return fail("Document could not be opened. Try again.", 503);
    return NextResponse.json({ url: signed.data.signedUrl, fileName: file.original_file_name, mimeType: file.mime_type }, { headers });
  } catch { return fail("Document could not be opened. Try again.", 503); }
}
