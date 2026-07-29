import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantId,
} from "@/lib/tenant-admin/server";

const evidenceTypes = new Set(["registration", "insurance", "inspection", "operating_permit"]);
const mimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);

async function authorize(request: Request, tenantId: string) {
  const token = getBearerToken(request);
  if (!token) throw new Error("Authentication is required.");
  const supabase = createRequestSupabaseClient({ accessToken: token });
  const [{ data: personId }, { data: canManage }] = await Promise.all([
    supabase.rpc("current_person_id"),
    supabase.rpc("can_manage_vehicle_management", { target_tenant_id: tenantId }),
  ]);
  if (!personId) throw new Error("An active person profile is required.");
  if (!canManage) throw new Error("Vehicle management permission is required.");
  return { supabase, personId };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantId = validateTenantId(url.searchParams.get("tenantId"));
    const evidenceId = validateTenantId(url.searchParams.get("evidenceId"));
    const { supabase } = await authorize(request, tenantId);
    const { data: evidence, error } = await supabase
      .from("vehicle_evidence")
      .select("storage_bucket, storage_path")
      .eq("tenant_id", tenantId)
      .eq("evidence_id", evidenceId)
      .single();
    if (error || !evidence)
      return NextResponse.json({ message: "Vehicle evidence not found." }, { status: 404 });
    const service = createServiceSupabaseClient();
    const { data, error: signedError } = await service.storage
      .from(evidence.storage_bucket)
      .createSignedUrl(evidence.storage_path, 600);
    if (signedError) throw signedError;
    return NextResponse.json(
      { url: `${data.signedUrl}&v=${Date.now()}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to open vehicle evidence." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  try {
    const form = await request.formData();
    const tenantId = validateTenantId(form.get("tenantId"));
    const vehicleId = validateTenantId(form.get("vehicleId"));
    const evidenceTypeValue = form.get("evidenceType");
    const evidenceType = typeof evidenceTypeValue === "string" ? evidenceTypeValue : "";
    const file = form.get("file");
    if (!evidenceTypes.has(evidenceType)) throw new Error("Unsupported evidence type.");
    if (!(file instanceof File) || file.size < 1 || !mimeTypes.has(file.type))
      throw new Error("Choose a JPEG, PNG, or PDF.");
    if (file.size > 5_000_000) throw new Error("Vehicle evidence must be 5MB or smaller.");
    const { personId } = await authorize(request, tenantId);
    const extension =
      file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    uploadedPath = `${tenantId}/vehicles/${vehicleId}/compliance/${evidenceType}-${crypto.randomUUID()}.${extension}`;
    const service = createServiceSupabaseClient();
    const { error: uploadError } = await service.storage
      .from("driver-application-files")
      .upload(uploadedPath, file);
    if (uploadError) throw uploadError;
    const { error } = await service.from("vehicle_evidence").insert({
      tenant_id: tenantId,
      vehicle_id: vehicleId,
      evidence_type: evidenceType,
      storage_path: uploadedPath,
      original_file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      submitted_by_person_id: personId,
    });
    if (error) {
      await service.storage.from("driver-application-files").remove([uploadedPath]);
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to upload vehicle evidence." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const { supabase, personId } = await authorize(request, tenantId);
    if (body.kind === "requirement") {
      const evidenceType = String(body.evidenceType);
      if (!evidenceTypes.has(evidenceType)) throw new Error("Unsupported evidence type.");
      if (
        typeof body.requiredForService !== "boolean" ||
        typeof body.expirationRequired !== "boolean"
      )
        throw new Error("Requirement flags are required.");
      const { error } = await supabase
        .from("vehicle_evidence_requirements")
        .update({
          required_for_service: body.requiredForService,
          expiration_required: body.expirationRequired,
          updated_by_person_id: personId,
        })
        .eq("tenant_id", tenantId)
        .eq("evidence_type", evidenceType);
      if (error) throw error;
    } else {
      const evidenceId = validateTenantId(body.evidenceId);
      const status = String(body.status);
      if (!["approved", "rejected"].includes(status)) throw new Error("Invalid review status.");
      const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
      if (status === "rejected" && !notes) throw new Error("A rejection reason is required.");
      const expiresOn =
        typeof body.expiresOn === "string" && body.expiresOn ? body.expiresOn : null;
      const { data: evidence, error: readError } = await supabase
        .from("vehicle_evidence")
        .select("evidence_type")
        .eq("tenant_id", tenantId)
        .eq("evidence_id", evidenceId)
        .single();
      if (readError || !evidence) throw new Error("Vehicle evidence not found.");
      const { data: requirement } = await supabase
        .from("vehicle_evidence_requirements")
        .select("expiration_required")
        .eq("tenant_id", tenantId)
        .eq("evidence_type", evidence.evidence_type)
        .single();
      if (
        status === "approved" &&
        ((requirement?.expiration_required && !expiresOn) ||
          (expiresOn && expiresOn <= new Date().toISOString().slice(0, 10)))
      )
        throw new Error("Expiration must be a future date.");
      const { error } = await supabase
        .from("vehicle_evidence")
        .update({
          review_status: status,
          review_notes: notes,
          expires_on: status === "approved" ? expiresOn : null,
          reviewed_at: new Date().toISOString(),
          reviewed_by_person_id: personId,
        })
        .eq("tenant_id", tenantId)
        .eq("evidence_id", evidenceId);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update vehicle evidence." },
      { status: 400 },
    );
  }
}
