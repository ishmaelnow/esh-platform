import { NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantId,
} from "@/lib/tenant-admin/server";
import { validateDriverProfileInput } from "@/lib/driver-management/server";

async function actor(request: Request) {
  const token = getBearerToken(request);
  if (!token) throw new Error("Authentication is required.");
  const supabase = createRequestSupabaseClient({ accessToken: token });
  const { data: person, error } = await supabase.rpc("current_person_id");
  if (error || !person) throw new Error("An active person profile is required.");
  return { supabase, personId: person };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const { supabase, personId } = await actor(request);
    if (body.kind === "application") {
      if (
        typeof body.fullName !== "string" ||
        !body.fullName.trim() ||
        typeof body.email !== "string" ||
        !body.email.trim()
      )
        throw new Error("Applicant name and email are required.");
      const { error } = await supabase.from("driver_applications").insert({
        tenant_id: tenantId,
        full_name: body.fullName.trim(),
        email: body.email.trim().toLowerCase(),
        phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
      });
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    const input = validateDriverProfileInput(body);
    const { error } = await supabase.from("driver_profiles").insert({
      tenant_id: tenantId,
      person_id: input.personId,
      driver_number: input.driverNumber,
      display_name: input.displayName,
      email: input.email,
      phone: input.phone,
      onboarding_date: input.onboardingDate,
      created_by_person_id: personId,
      updated_by_person_id: personId,
    });
    if (error) return NextResponse.json({ message: error.message }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to create driver." },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) throw new Error("Authentication is required.");
    const url = new URL(request.url);
    const tenantId = validateTenantId(url.searchParams.get("tenantId"));
    const applicationId = validateTenantId(url.searchParams.get("applicationId"));
    const { supabase } = await actor(request);
    const { data: application, error } = await supabase
      .from("driver_applications")
      .select("personal_photo_path, vehicle_photo_path, document_path")
      .eq("tenant_id", tenantId)
      .eq("driver_application_id", applicationId)
      .single();
    if (error || !application)
      return NextResponse.json({ message: "Application not found." }, { status: 404 });
    const paths = [
      application.personal_photo_path,
      application.vehicle_photo_path,
      application.document_path,
    ].filter((path): path is string => Boolean(path));
    const service = createServiceSupabaseClient();
    const { data: signed, error: signedError } = await service.storage
      .from("driver-application-files")
      .createSignedUrls(paths, 600);
    if (signedError) throw signedError;
    return NextResponse.json({
      urls:
        signed?.map((item) => item.signedUrl).filter((url): url is string => Boolean(url)) ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to load application files." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const { supabase, personId } = await actor(request);
    if (body.kind === "approve_application") {
      const applicationId = validateTenantId(body.applicationId);
      const { error } = await supabase.rpc("approve_driver_application", {
        target_application_id: applicationId,
        actor_id: personId,
      });
      if (error) return NextResponse.json({ message: error.message }, { status: 400 });
      return NextResponse.json({ ok: true });
    }
    const driverProfileId = validateTenantId(body.driverProfileId);
    const input = validateDriverProfileInput(body);
    const { error } = await supabase
      .from("driver_profiles")
      .update({
        person_id: input.personId,
        driver_number: input.driverNumber,
        display_name: input.displayName,
        email: input.email,
        phone: input.phone,
        onboarding_date: input.onboardingDate,
        updated_by_person_id: personId,
      })
      .eq("tenant_id", tenantId)
      .eq("driver_profile_id", driverProfileId);
    if (error) return NextResponse.json({ message: error.message }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update driver." },
      { status: 400 },
    );
  }
}
