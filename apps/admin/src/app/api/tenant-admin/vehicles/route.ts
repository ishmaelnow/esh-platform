import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantId,
} from "@/lib/tenant-admin/server";

const imageTypes = new Set(["image/jpeg", "image/png"]);

async function authorize(request: Request, tenantId: string) {
  const token = getBearerToken(request);
  if (!token) throw new Error("Authentication is required.");
  const supabase = createRequestSupabaseClient({ accessToken: token });
  const [{ data: personId, error: personError }, { data: canManage, error: permissionError }] =
    await Promise.all([
      supabase.rpc("current_person_id"),
      supabase.rpc("can_manage_vehicle_management", { target_tenant_id: tenantId }),
    ]);
  if (personError || !personId) throw new Error("An active person profile is required.");
  if (permissionError || !canManage) throw new Error("Vehicle management permission is required.");
  return { supabase, personId };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tenantId = validateTenantId(url.searchParams.get("tenantId"));
    const vehicleId = validateTenantId(url.searchParams.get("vehicleId"));
    const { supabase } = await authorize(request, tenantId);
    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .select("photo_storage_bucket, photo_storage_path")
      .eq("tenant_id", tenantId)
      .eq("vehicle_id", vehicleId)
      .single();
    if (error || !vehicle?.photo_storage_bucket || !vehicle.photo_storage_path) {
      return NextResponse.json({ message: "Vehicle photo not found." }, { status: 404 });
    }
    const service = createServiceSupabaseClient();
    const { data, error: signedError } = await service.storage
      .from(vehicle.photo_storage_bucket)
      .createSignedUrl(vehicle.photo_storage_path, 600);
    if (signedError) throw signedError;
    return NextResponse.json({ url: `${data.signedUrl}&v=${Date.now()}` });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to open vehicle photo." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null;
  try {
    const form = await request.formData();
    const tenantId = validateTenantId(form.get("tenantId"));
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === "string" ? value.trim() : "";
    };
    const vehicleNumber = text("vehicleNumber");
    const make = text("make");
    const model = text("model");
    const modelYear = Number(text("modelYear"));
    const color = text("color");
    const licensePlate = text("licensePlate");
    const vin = text("vin");
    const photo = form.get("photo");
    if (!vehicleNumber || !make || !model || !color || !licensePlate || vin.length !== 17) {
      throw new Error("Complete all vehicle fields; VIN must contain exactly 17 characters.");
    }
    if (!Number.isInteger(modelYear) || modelYear < 1900 || modelYear > 2100) {
      throw new Error("Enter a valid model year.");
    }
    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto && !imageTypes.has(photo.type))
      throw new Error("Vehicle photo must be JPEG or PNG.");
    if (hasPhoto && photo.size > 5_000_000)
      throw new Error("Vehicle photo must be 5MB or smaller.");

    const { supabase, personId } = await authorize(request, tenantId);
    const vehicleId = crypto.randomUUID();
    if (hasPhoto) {
      const extension = photo.type === "image/png" ? "png" : "jpg";
      uploadedPath = `${tenantId}/vehicles/${vehicleId}/photo-${crypto.randomUUID()}.${extension}`;
      const service = createServiceSupabaseClient();
      const { error: uploadError } = await service.storage
        .from("driver-application-files")
        .upload(uploadedPath, photo, { upsert: false });
      if (uploadError) throw uploadError;
    }
    const { error } = await supabase.from("vehicles").insert({
      vehicle_id: vehicleId,
      tenant_id: tenantId,
      vehicle_number: vehicleNumber,
      make,
      model,
      model_year: modelYear,
      color,
      license_plate: licensePlate,
      vin,
      photo_storage_bucket: hasPhoto ? "driver-application-files" : null,
      photo_storage_path: uploadedPath,
      photo_original_file_name: hasPhoto ? photo.name : null,
      photo_mime_type: hasPhoto ? photo.type : null,
      photo_size_bytes: hasPhoto ? photo.size : null,
      created_by_person_id: personId,
      updated_by_person_id: personId,
    });
    if (error) {
      if (uploadedPath)
        await createServiceSupabaseClient()
          .storage.from("driver-application-files")
          .remove([uploadedPath]);
      throw error;
    }
    return NextResponse.json({ ok: true, vehicleId });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create vehicle." },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request) {
  let uploadedPath: string | null = null;
  try {
    const form = await request.formData();
    const tenantId = validateTenantId(form.get("tenantId"));
    const vehicleId = validateTenantId(form.get("vehicleId"));
    const photo = form.get("photo");
    if (!(photo instanceof File) || !imageTypes.has(photo.type) || photo.size < 1) {
      throw new Error("Choose a JPEG or PNG vehicle photo.");
    }
    if (photo.size > 5_000_000) throw new Error("Vehicle photo must be 5MB or smaller.");
    const { supabase, personId } = await authorize(request, tenantId);
    const { data: current, error: readError } = await supabase
      .from("vehicles")
      .select("photo_storage_bucket, photo_storage_path")
      .eq("tenant_id", tenantId)
      .eq("vehicle_id", vehicleId)
      .single();
    if (readError || !current) throw new Error("Vehicle not found.");
    const extension = photo.type === "image/png" ? "png" : "jpg";
    uploadedPath = `${tenantId}/vehicles/${vehicleId}/photo-${crypto.randomUUID()}.${extension}`;
    const service = createServiceSupabaseClient();
    const { error: uploadError } = await service.storage
      .from("driver-application-files")
      .upload(uploadedPath, photo, { upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await supabase
      .from("vehicles")
      .update({
        photo_storage_bucket: "driver-application-files",
        photo_storage_path: uploadedPath,
        photo_original_file_name: photo.name,
        photo_mime_type: photo.type,
        photo_size_bytes: photo.size,
        updated_by_person_id: personId,
      })
      .eq("tenant_id", tenantId)
      .eq("vehicle_id", vehicleId);
    if (error) {
      await service.storage.from("driver-application-files").remove([uploadedPath]);
      throw error;
    }
    if (current.photo_storage_bucket && current.photo_storage_path) {
      await service.storage.from(current.photo_storage_bucket).remove([current.photo_storage_path]);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to replace vehicle photo." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const vehicleId = validateTenantId(body.vehicleId);
    const { supabase, personId } = await authorize(request, tenantId);
    if (body.kind === "status") {
      const status = String(body.status);
      if (!["active", "suspended", "retired"].includes(status))
        throw new Error("Unsupported vehicle status.");
      const reason = typeof body.reason === "string" ? body.reason.trim() || null : null;
      if (["suspended", "retired"].includes(status) && !reason)
        throw new Error("A status reason is required.");
      const { error } = await supabase
        .from("vehicles")
        .update({ status, status_reason: reason, updated_by_person_id: personId })
        .eq("tenant_id", tenantId)
        .eq("vehicle_id", vehicleId);
      if (error) throw error;
    } else if (body.kind === "assign") {
      const driverProfileId = validateTenantId(body.driverProfileId);
      const { error } = await supabase.from("driver_vehicle_assignments").insert({
        tenant_id: tenantId,
        vehicle_id: vehicleId,
        driver_profile_id: driverProfileId,
        assignment_notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        created_by_person_id: personId,
      });
      if (error) throw error;
    } else if (body.kind === "unassign") {
      const assignmentId = validateTenantId(body.assignmentId);
      const { error } = await supabase
        .from("driver_vehicle_assignments")
        .update({ ended_at: new Date().toISOString(), ended_by_person_id: personId })
        .eq("tenant_id", tenantId)
        .eq("vehicle_id", vehicleId)
        .eq("assignment_id", assignmentId)
        .is("ended_at", null);
      if (error) throw error;
    } else {
      throw new Error("Unsupported vehicle action.");
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update vehicle." },
      { status: 400 },
    );
  }
}
