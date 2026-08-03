import type {
  PersonProfileRow,
  TenantConfigurationRow,
  TenantMembershipRow,
  TenantRow,
  PlatformSupabaseClient,
} from "@esh-platform/supabase";
import type {
  ActiveTenantOption,
  FoundationTenantRole,
  PrincipalTenantContext,
  TenantContextResolution,
} from "./types";

export function adminAuthRefreshMode(
  event: string,
  previousUserId: string | null,
  nextUserId: string | null,
): "none" | "background" | "blocking" {
  if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION" || event === "PASSWORD_RECOVERY")
    return "none";
  if (event === "SIGNED_IN") return previousUserId === nextUserId ? "none" : "blocking";
  if (event === "USER_UPDATED") return "background";
  return "blocking";
}

export type AdminSupabaseClient = PlatformSupabaseClient;

export type AuthUserReference = {
  id: string;
};

type ActiveTenantPreference = {
  tenant_id: string;
  membership_id: string;
} | null;

export function hasFoundationTenantRole(
  roles: readonly string[],
  expectedRoles: readonly FoundationTenantRole[],
) {
  return roles.some((role) => expectedRoles.includes(role as FoundationTenantRole));
}

export function chooseInitialTenant(
  memberships: readonly ActiveTenantOption[],
  preference: ActiveTenantPreference,
): ActiveTenantOption | null {
  if (memberships.length === 0) {
    return null;
  }

  if (memberships.length === 1) {
    return memberships[0] ?? null;
  }

  if (!preference) {
    return null;
  }

  return (
    memberships.find(
      ({ membership }) =>
        membership.tenant_id === preference.tenant_id &&
        membership.membership_id === preference.membership_id,
    ) ?? null
  );
}

export async function getAuthenticatedPerson(
  supabase: AdminSupabaseClient,
  user: AuthUserReference,
): Promise<PersonProfileRow | null> {
  const { data, error } = await supabase
    .from("person_profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function loadPrincipalTenantContext(
  supabase: AdminSupabaseClient,
  user: AuthUserReference,
): Promise<TenantContextResolution> {
  const person = await getAuthenticatedPerson(supabase, user);

  if (!person) {
    return { status: "signed_in_without_profile" };
  }

  const [
    { data: memberships, error: membershipsError },
    { data: preference, error: preferenceError },
  ] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("*")
      .eq("person_id", person.person_id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("active_tenant_preferences")
      .select("*")
      .eq("person_id", person.person_id)
      .maybeSingle(),
  ]);

  if (membershipsError) {
    throw membershipsError;
  }

  if (preferenceError) {
    throw preferenceError;
  }

  const activeMemberships = memberships ?? [];
  const [tenants, configurations, roleAssignments] = await Promise.all([
    loadTenantsForMemberships(supabase, activeMemberships),
    loadConfigurationsForMemberships(supabase, activeMemberships),
    loadRolesForMemberships(supabase, activeMemberships),
  ]);

  const options = activeMemberships.flatMap((membership) => {
    const tenant = tenants.get(membership.tenant_id);

    if (!tenant) {
      return [];
    }

    return [
      {
        membership,
        tenant,
        configuration: configurations.get(membership.tenant_id) ?? null,
        roles: roleAssignments.get(membership.membership_id) ?? [],
      },
    ];
  });

  const selectedTenant = chooseInitialTenant(options, preference);
  const context: PrincipalTenantContext = {
    person,
    memberships: options,
    selectedTenantId: selectedTenant?.tenant.tenant_id ?? null,
    selectedMembershipId: selectedTenant?.membership.membership_id ?? null,
    preference: preference ?? null,
  };

  if (options.length === 0) {
    return { status: "no_active_memberships", context };
  }

  if (!selectedTenant) {
    return { status: "tenant_selection_required", context };
  }

  return {
    status: "ready",
    context,
    selectedTenant,
  };
}

async function loadTenantsForMemberships(
  supabase: AdminSupabaseClient,
  memberships: readonly TenantMembershipRow[],
): Promise<Map<string, TenantRow>> {
  const tenantIds = [...new Set(memberships.map(({ tenant_id }) => tenant_id))];

  if (tenantIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase.from("tenants").select("*").in("tenant_id", tenantIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((tenant) => [tenant.tenant_id, tenant]));
}

async function loadConfigurationsForMemberships(
  supabase: AdminSupabaseClient,
  memberships: readonly TenantMembershipRow[],
): Promise<Map<string, TenantConfigurationRow>> {
  const tenantIds = [...new Set(memberships.map(({ tenant_id }) => tenant_id))];

  if (tenantIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("tenant_configurations")
    .select("*")
    .in("tenant_id", tenantIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((configuration) => [configuration.tenant_id, configuration]));
}

async function loadRolesForMemberships(
  supabase: AdminSupabaseClient,
  memberships: readonly TenantMembershipRow[],
): Promise<Map<string, FoundationTenantRole[]>> {
  const membershipIds = memberships.map(({ membership_id }) => membership_id);

  if (membershipIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("tenant_role_assignments")
    .select("*")
    .in("membership_id", membershipIds)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  const rolesByMembership = new Map<string, FoundationTenantRole[]>();

  for (const assignment of data ?? []) {
    const roles = rolesByMembership.get(assignment.membership_id) ?? [];
    roles.push(assignment.role_key as FoundationTenantRole);
    rolesByMembership.set(assignment.membership_id, roles);
  }

  return rolesByMembership;
}

export async function persistActiveTenantPreference(
  supabase: AdminSupabaseClient,
  personId: string,
  tenant: ActiveTenantOption,
) {
  const { error } = await supabase.from("active_tenant_preferences").upsert({
    person_id: personId,
    tenant_id: tenant.tenant.tenant_id,
    membership_id: tenant.membership.membership_id,
    selected_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}
