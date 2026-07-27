import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { createRequestSupabaseClient, getBearerToken } from "@/lib/tenant-admin/server";

const uploadFields = [
  ["personalPhoto", "personal", "personal_photo"],
  ["vehiclePhoto", "vehicle", "vehicle_photo"],
  ["document", "document", "reference_document"],
] as const;

export async function POST(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) throw new Error("Verify your email before submitting an application.");
    const supabase = createRequestSupabaseClient({ accessToken: token });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user?.email || !user.email_confirmed_at)
      throw new Error("A verified email session is required.");

    const form = await request.formData();
    const tenantSlug = form.get("tenantSlug");
    const fullName = form.get("fullName");
    const email = form.get("email");
    if (typeof tenantSlug !== "string" || typeof fullName !== "string" || typeof email !== "string")
      throw new Error("Application link, name, and email are required.");
    if (email.trim().toLowerCase() !== user.email.trim().toLowerCase())
      throw new Error("Application email must match the verified email.");
    const phone = form.get("phone");
    const { data: applicationId, error } = await supabase.rpc(
      "submit_transport_driver_application",
      {
        application_tenant_slug: tenantSlug,
        applicant_name: fullName,
        applicant_email: email,
        ...(typeof phone === "string" && phone ? { applicant_phone: phone } : {}),
      },
    );
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    if (typeof applicationId !== "string") throw new Error("Unable to create application.");

    const service = createServiceSupabaseClient();
    const { data: application, error: applicationError } = await service
      .from("driver_applications")
      .select("tenant_id")
      .eq("driver_application_id", applicationId)
      .single();
    if (applicationError || !application) throw new Error("Unable to verify application.");

    const paths: Record<string, string | null> = { personal: null, vehicle: null, document: null };
    const evidence: Array<{
      tenant_id: string;
      driver_application_id: string;
      evidence_type: string;
      storage_path: string;
      original_file_name: string;
      mime_type: string;
      size_bytes: number;
    }> = [];

    for (const [field, legacyKey, evidenceType] of uploadFields) {
      const file = form.get(field);
      if (!(file instanceof File) || file.size === 0) continue;
      if (
        file.size > 5_000_000 ||
        !["image/jpeg", "image/png", "application/pdf"].includes(file.type)
      )
        throw new Error("Files must be JPEG, PNG, or PDF and 5MB or smaller.");
      const extension =
        file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
      const path = `${application.tenant_id}/${applicationId}/${evidenceType}-${crypto.randomUUID()}.${extension}`;
      const upload = await service.storage
        .from("driver-application-files")
        .upload(path, file, { upsert: false });
      if (upload.error) throw upload.error;
      paths[legacyKey] = path;
      evidence.push({
        tenant_id: application.tenant_id,
        driver_application_id: applicationId,
        evidence_type: evidenceType,
        storage_path: path,
        original_file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      });
    }

    if (evidence.length > 0) {
      const { error: evidenceError } = await service.from("driver_evidence").insert(evidence);
      if (evidenceError) throw evidenceError;
    }

    const attach = await service.rpc("attach_driver_application_files", {
      target_application_id: applicationId,
      ...(paths.personal ? { personal_path: paths.personal } : {}),
      ...(paths.vehicle ? { vehicle_path: paths.vehicle } : {}),
      ...(paths.document ? { document_path_value: paths.document } : {}),
    });
    if (attach.error) throw attach.error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to submit application." },
      { status: 400 },
    );
  }
}
