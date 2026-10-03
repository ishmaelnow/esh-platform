import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { createRequestSupabaseClient, getBearerToken, validateTenantId } from "@/lib/tenant-admin/server";

async function applicantInsurance(request: Request, tenantId: string, applicationId: string) {
  const token = getBearerToken(request);
  if (!token) throw new Error("Authentication is required.");
  const client = createRequestSupabaseClient({ accessToken: token });
  const permission = await client.rpc("can_manage_driver_management", { target_tenant_id: tenantId });
  if (permission.error || permission.data !== true) throw new Error("Driver management permission is required.");
  const result = await client.from("driver_application_insurance")
    .select("original_file_name, storage_bucket, storage_path, vehicle_evidence_id")
    .eq("tenant_id", tenantId).eq("driver_application_id", applicationId).maybeSingle();
  if (result.error) throw new Error("Application insurance is unavailable.");
  return { client, insurance: result.data };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { insurance } = await applicantInsurance(request, validateTenantId(url.searchParams.get("tenantId")), validateTenantId(url.searchParams.get("applicationId")));
    let signedUrl: string | null = null;
    if (insurance && url.searchParams.get("open") === "1") {
      const signed = await createServiceSupabaseClient().storage.from(insurance.storage_bucket).createSignedUrl(insurance.storage_path, 600);
      if (signed.error) throw new Error("Unable to open insurance file.");
      signedUrl = signed.data.signedUrl;
    }
    return NextResponse.json({ insurance: insurance ? { fileName: insurance.original_file_name, linked: Boolean(insurance.vehicle_evidence_id) } : null,
      ...(signedUrl ? { url: signedUrl } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Insurance is unavailable." }, { status: 403 }); }
}

export async function POST(request: Request) {
  try {
    const input = await request.json() as { tenantId?: string; applicationId?: string; vehicleId?: string };
    const applicationId = validateTenantId(input.applicationId);
    const { client, insurance } = await applicantInsurance(request, validateTenantId(input.tenantId), applicationId);
    if (!insurance) throw new Error("Application insurance is missing.");
    const result = await client.rpc("link_driver_application_insurance", { target_application_id: applicationId, target_vehicle_id: validateTenantId(input.vehicleId) });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to link insurance." }, { status: 400 }); }
}
