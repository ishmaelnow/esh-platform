import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@esh-platform/config";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert, TablesUpdate } from "./database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./database.types";
export type SupabaseAuthSession = Session;
export type PlatformSupabaseClient = SupabaseClient<Database>;
export type PublicSupabaseClientConfig = {
  url: string;
  anonKey: string;
};

export const tenantFoundationTables = [
  "person_profiles",
  "tenants",
  "tenant_configurations",
  "tenant_capabilities",
  "tenant_memberships",
  "tenant_invitations",
  "platform_role_assignments",
  "tenant_role_assignments",
  "tenant_audit_events",
  "active_tenant_preferences",
] as const;

export type TenantFoundationTable = (typeof tenantFoundationTables)[number];

export type TenantFoundationRow<TTable extends TenantFoundationTable> = Tables<TTable>;

export type TenantFoundationInsert<TTable extends TenantFoundationTable> = TablesInsert<TTable>;

export type TenantFoundationUpdate<TTable extends TenantFoundationTable> = TablesUpdate<TTable>;

export type PersonProfileRow = Tables<"person_profiles">;
export type DriverProfileRow = Tables<"driver_profiles">;
export type DriverAvailabilityRow = Tables<"driver_availability">;
export type DriverApplicationRow = Tables<"driver_applications">;
export type DriverEvidenceRow = Tables<"driver_evidence">;
export type DriverEvidenceRequirementRow = Tables<"driver_evidence_requirements">;
export type DriverOnboardingChecklistRow = Tables<"driver_onboarding_checklists">;
export type DriverNotificationPreferenceRow = Tables<"driver_notification_preferences">;
export type NotificationOutboxRow = Tables<"notification_outbox">;
export type VehicleRow = Tables<"vehicles">;
export type DriverVehicleAssignmentRow = Tables<"driver_vehicle_assignments">;
export type ServiceAreaRow = Tables<"service_areas">;
export type DriverServiceAreaAssignmentRow = Tables<"driver_service_area_assignments">;
export type DispatchBookingRow = Tables<"dispatch_bookings">;
export type DispatchOfferRow = Tables<"dispatch_offers">;
export type VehicleEvidenceRow = Tables<"vehicle_evidence">;
export type VehicleEvidenceRequirementRow = Tables<"vehicle_evidence_requirements">;
export type TenantRow = Tables<"tenants">;
export type TenantConfigurationRow = Tables<"tenant_configurations">;
export type TenantCapabilityRow = Tables<"tenant_capabilities">;
export type TenantMembershipRow = Tables<"tenant_memberships">;
export type TenantInvitationRow = Tables<"tenant_invitations">;
export type PlatformRoleAssignmentRow = Tables<"platform_role_assignments">;
export type TenantRoleAssignmentRow = Tables<"tenant_role_assignments">;
export type TenantAuditEventRow = Tables<"tenant_audit_events">;
export type ActiveTenantPreferenceRow = Tables<"active_tenant_preferences">;

declare global {
  var __eshPlatformBrowserSupabaseClient: PlatformSupabaseClient | undefined;
}

export function createBrowserSupabaseClient(config?: PublicSupabaseClientConfig) {
  if (globalThis.__eshPlatformBrowserSupabaseClient) {
    return globalThis.__eshPlatformBrowserSupabaseClient;
  }

  const { url, anonKey } = config ?? getPublicSupabaseConfig();

  globalThis.__eshPlatformBrowserSupabaseClient = createClient<Database>(url, anonKey);

  return globalThis.__eshPlatformBrowserSupabaseClient;
}

export function createIsolatedBrowserSupabaseClient(
  storageKey: string,
  config?: PublicSupabaseClientConfig,
) {
  const { url, anonKey } = config ?? getPublicSupabaseConfig();

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey,
    },
  });
}

export function createAuthenticatedSupabaseClient(
  accessToken: string,
  source: NodeJS.ProcessEnv = process.env,
) {
  const { url, anonKey } = getPublicSupabaseConfig(source);

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function createAnonymousSupabaseClient(source: NodeJS.ProcessEnv = process.env) {
  const { url, anonKey } = getPublicSupabaseConfig(source);

  return createClient<Database>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createServiceSupabaseClient(source: NodeJS.ProcessEnv = process.env) {
  const { url } = getPublicSupabaseConfig(source);
  const serviceRoleKey = source.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for service Supabase access.");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
}
