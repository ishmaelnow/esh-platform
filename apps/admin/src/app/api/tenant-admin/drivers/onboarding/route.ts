import { NextResponse } from "next/server";
import {
  createRequestSupabaseClient,
  getBearerToken,
  validateTenantId,
} from "@/lib/tenant-admin/server";

const fields = {
  personalDetailsComplete: "personal_details_complete",
  personalPhotoComplete: "personal_photo_complete",
  vehicleDetailsComplete: "vehicle_details_complete",
  vehiclePhotoComplete: "vehicle_photo_complete",
  reviewStatus: "review_status",
  reviewNotes: "review_notes",
} as const;

export async function PATCH(request: Request) {
  try {
    const token = getBearerToken(request);
    if (!token) throw new Error("Authentication is required.");
    const body = (await request.json()) as Record<string, unknown>;
    const tenantId = validateTenantId(body.tenantId);
    const driverProfileId = validateTenantId(body.driverProfileId);
    const supabase = createRequestSupabaseClient({ accessToken: token });
    const { data: personId, error: personError } = await supabase.rpc("current_person_id");
    if (personError || !personId) throw new Error("An active person profile is required.");
    const update: Record<string, unknown> = {
      reviewed_by_person_id: personId,
      reviewed_at: new Date().toISOString(),
    };
    for (const [key, column] of Object.entries(fields)) if (key in body) update[column] = body[key];
    const { error } = await supabase
      .from("driver_onboarding_checklists")
      .update(update)
      .eq("tenant_id", tenantId)
      .eq("driver_profile_id", driverProfileId);
    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to update onboarding." },
      { status: 400 },
    );
  }
}
