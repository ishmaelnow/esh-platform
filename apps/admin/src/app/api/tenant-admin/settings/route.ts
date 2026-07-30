import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantConfigurationPayload,
  validateTenantId,
} from "@/lib/tenant-admin/server";
import { parseServiceAreaInput } from "@/lib/tenant-admin/service-areas";

async function authorizeServiceAreas(request: Request, tenantId: string) {
  const accessToken = getBearerToken(request);
  if (!accessToken) throw new Error("Authentication is required.");
  const supabase = createRequestSupabaseClient({ accessToken });
  const [{ data: personId, error: personError }, { data: canManage, error: permissionError }] =
    await Promise.all([
      supabase.rpc("current_person_id"),
      supabase.rpc("can_manage_service_areas", { target_tenant_id: tenantId }),
    ]);
  if (personError || !personId) throw new Error("An active person profile is required.");
  if (permissionError || !canManage)
    throw new Error("Service area management permission is required.");
  return { supabase, personId };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const input = parseServiceAreaInput(body);
    const { supabase, personId } = await authorizeServiceAreas(request, tenantId);
    const { data, error } = await supabase
      .from("service_areas")
      .insert({
        tenant_id: tenantId,
        name: input.name,
        description: input.description,
        center_latitude: input.centerLatitude,
        center_longitude: input.centerLongitude,
        radius_km: input.radiusKm,
        created_by_person_id: personId,
        updated_by_person_id: personId,
      })
      .select("service_area_id")
      .single();
    if (error || !data) throw error ?? new Error("Unable to create service area.");
    return NextResponse.json({ ok: true, serviceAreaId: data.service_area_id });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create service area." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const accessToken = getBearerToken(request);

    if (!accessToken) {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    }

    const body = (await request.json()) as unknown;

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
    }

    const tenantId = validateTenantId((body as { tenantId?: unknown }).tenantId);
    const record = body as Record<string, unknown>;
    if (typeof record.kind === "string" && record.kind.startsWith("service_area_")) {
      const serviceAreaId = validateTenantId(record.serviceAreaId);
      const { supabase, personId } = await authorizeServiceAreas(request, tenantId);
      if (record.kind === "service_area_update") {
        const input = parseServiceAreaInput(record);
        const { error } = await supabase
          .from("service_areas")
          .update({
            name: input.name,
            description: input.description,
            center_latitude: input.centerLatitude,
            center_longitude: input.centerLongitude,
            radius_km: input.radiusKm,
            updated_by_person_id: personId,
          })
          .eq("tenant_id", tenantId)
          .eq("service_area_id", serviceAreaId);
        if (error) throw error;
      } else if (record.kind === "service_area_status") {
        if (record.status !== "active" && record.status !== "inactive")
          throw new Error("Unsupported service area status.");
        const { error } = await supabase
          .from("service_areas")
          .update({ status: record.status, updated_by_person_id: personId })
          .eq("tenant_id", tenantId)
          .eq("service_area_id", serviceAreaId);
        if (error) throw error;
      } else if (record.kind === "service_area_assign") {
        const driverProfileId = validateTenantId(record.driverProfileId);
        const { error } = await supabase.from("driver_service_area_assignments").insert({
          tenant_id: tenantId,
          driver_profile_id: driverProfileId,
          service_area_id: serviceAreaId,
          assignment_notes: typeof record.notes === "string" ? record.notes.trim() || null : null,
          created_by_person_id: personId,
        });
        if (error) throw error;
      } else if (record.kind === "service_area_unassign") {
        const assignmentId = validateTenantId(record.assignmentId);
        const { error } = await supabase
          .from("driver_service_area_assignments")
          .update({ ended_at: new Date().toISOString(), ended_by_person_id: personId })
          .eq("tenant_id", tenantId)
          .eq("service_area_id", serviceAreaId)
          .eq("assignment_id", assignmentId)
          .is("ended_at", null);
        if (error) throw error;
      } else {
        throw new Error("Unsupported service area action.");
      }
      return NextResponse.json({ ok: true });
    }
    const configuration = validateTenantConfigurationPayload(
      (body as { configuration?: unknown }).configuration,
    );
    const supabase = createRequestSupabaseClient({ accessToken });
    const { error } = await supabase
      .from("tenant_configurations")
      .update(configuration)
      .eq("tenant_id", tenantId);

    if (error) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update tenant settings." },
      { status: 400 },
    );
  }
}
