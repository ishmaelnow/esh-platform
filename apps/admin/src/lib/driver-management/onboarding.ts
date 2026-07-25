import type { SupabaseAuthSession } from "@esh-platform/supabase";

export type DriverOnboardingUpdate = {
  personalDetailsComplete?: boolean;
  personalPhotoComplete?: boolean;
  vehicleDetailsComplete?: boolean;
  vehiclePhotoComplete?: boolean;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewNotes?: string | null;
};

export async function updateDriverOnboarding(
  session: SupabaseAuthSession,
  tenantId: string,
  driverProfileId: string,
  input: DriverOnboardingUpdate,
) {
  const response = await fetch("/api/tenant-admin/drivers/onboarding", {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tenantId, driverProfileId, ...input }),
  });
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return response.ok
    ? { ok: true as const }
    : { ok: false as const, message: payload?.message ?? "Unable to update onboarding." };
}
