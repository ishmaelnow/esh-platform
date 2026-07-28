import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantId,
} from "@/lib/tenant-admin/server";
import {
  driverEvidenceTypes,
  parseDriverEvidenceReview,
  validateEvidenceExpiration,
} from "@/lib/driver-management/evidence";

const evidenceTypes = new Set<string>(driverEvidenceTypes);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);

async function authorizedClient(request: Request) {
  const token = getBearerToken(request);
  if (!token) throw new Error("Authentication is required.");
  const supabase = createRequestSupabaseClient({ accessToken: token });
  const { data: personId, error } = await supabase.rpc("current_person_id");
  if (error || !personId) throw new Error("An active person profile is required.");
  return { supabase, personId };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantId = validateTenantId(url.searchParams.get("tenantId"));
    const evidenceId = validateTenantId(url.searchParams.get("evidenceId"));
    const { supabase } = await authorizedClient(request);
    const { data: evidence, error } = await supabase
      .from("driver_evidence")
      .select("storage_bucket, storage_path")
      .eq("tenant_id", tenantId)
      .eq("evidence_id", evidenceId)
      .single();
    if (error || !evidence)
      return NextResponse.json({ message: "Evidence not found." }, { status: 404 });

    const service = createServiceSupabaseClient();
    const { data, error: signedError } = await service.storage
      .from(evidence.storage_bucket)
      .createSignedUrl(evidence.storage_path, 600);
    if (signedError) throw signedError;
    return NextResponse.json({ url: data.signedUrl });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to open evidence." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const tenantId = validateTenantId(form.get("tenantId"));
    const driverProfileId = validateTenantId(form.get("driverProfileId"));
    const evidenceType =
      typeof form.get("evidenceType") === "string" ? form.get("evidenceType") : "";
    const file = form.get("file");
    if (typeof evidenceType !== "string" || !evidenceTypes.has(evidenceType))
      throw new Error("A supported evidence type is required.");
    if (!(file instanceof File) || file.size === 0)
      throw new Error("An evidence file is required.");
    if (file.size > 5_000_000 || !allowedMimeTypes.has(file.type))
      throw new Error("Files must be JPEG, PNG, or PDF and 5MB or smaller.");

    const { supabase } = await authorizedClient(request);
    const { data: canManage, error: permissionError } = await supabase.rpc(
      "can_manage_driver_management",
      { target_tenant_id: tenantId },
    );
    if (permissionError || !canManage) throw new Error("Driver management permission is required.");
    const { data: driver, error: driverError } = await supabase
      .from("driver_profiles")
      .select("driver_profile_id")
      .eq("tenant_id", tenantId)
      .eq("driver_profile_id", driverProfileId)
      .single();
    if (driverError || !driver) throw new Error("Driver not found.");

    const extension =
      file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = `${tenantId}/drivers/${driverProfileId}/${evidenceType}-${crypto.randomUUID()}.${extension}`;
    const service = createServiceSupabaseClient();
    const { error: uploadError } = await service.storage
      .from("driver-application-files")
      .upload(path, file, { upsert: false });
    if (uploadError) throw uploadError;
    const { error: evidenceError } = await service.from("driver_evidence").insert({
      tenant_id: tenantId,
      driver_profile_id: driverProfileId,
      evidence_type: evidenceType,
      storage_path: path,
      original_file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    });
    if (evidenceError) {
      await service.storage.from("driver-application-files").remove([path]);
      throw evidenceError;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to upload evidence." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const evidenceId = validateTenantId(body.evidenceId);
    const parsedReview = parseDriverEvidenceReview(body);

    const { supabase, personId } = await authorizedClient(request);
    const { data: evidence, error: evidenceReadError } = await supabase
      .from("driver_evidence")
      .select("evidence_type")
      .eq("tenant_id", tenantId)
      .eq("evidence_id", evidenceId)
      .single();
    if (evidenceReadError || !evidence)
      return NextResponse.json({ message: "Evidence not found." }, { status: 404 });
    const { data: requirement, error: requirementError } = await supabase
      .from("driver_evidence_requirements")
      .select("expiration_required")
      .eq("tenant_id", tenantId)
      .eq("evidence_type", evidence.evidence_type)
      .maybeSingle();
    if (requirementError) throw requirementError;
    const review = validateEvidenceExpiration(
      parsedReview,
      requirement?.expiration_required ?? false,
      new Date().toISOString().slice(0, 10),
    );
    const { data, error } = await supabase
      .from("driver_evidence")
      .update({
        review_status: review.status,
        review_notes: review.notes,
        expires_on: review.expiresOn,
        reviewed_by_person_id: personId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("tenant_id", tenantId)
      .eq("evidence_id", evidenceId)
      .select("evidence_id")
      .single();
    if (error || !data)
      return NextResponse.json(
        { message: error?.message ?? "Evidence not found." },
        { status: 403 },
      );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to review evidence." },
      { status: 400 },
    );
  }
}
