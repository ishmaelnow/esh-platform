import type { TenantMembershipRow, TenantRoleAssignmentRow } from "@esh-platform/supabase";
import type { AdminSupabaseClient } from "./context";
import type { MembershipWithRoles, TenantMemberDirectoryPerson, TenantSummary } from "./types";

export async function loadTenantSummary(
  supabase: AdminSupabaseClient,
  tenantId: string,
): Promise<TenantSummary> {
  const expirationResult = await supabase.rpc("expire_dispatch_offers", {
    target_tenant_id: tenantId,
  });
  if (
    expirationResult.error &&
    !expirationResult.error.message.includes("expire_dispatch_offers")
  ) {
    throw expirationResult.error;
  }
  const activationResult = await supabase.rpc("activate_due_scheduled_bookings", {
    target_tenant_id: tenantId,
  });
  if (
    activationResult.error &&
    !activationResult.error.message.includes("activate_due_scheduled_bookings")
  ) {
    throw activationResult.error;
  }

  const [
    tenantResult,
    configurationResult,
    capabilitiesResult,
    membershipsResult,
    invitationsResult,
    roleAssignmentsResult,
    auditResult,
    driversResult,
    driverAvailabilityResult,
    driverLocationsResult,
    onboardingResult,
    applicationsResult,
    evidenceResult,
    evidenceRequirementsResult,
    notificationsResult,
    vehiclesResult,
    assignmentsResult,
    vehicleEvidenceResult,
    vehicleEvidenceRequirementsResult,
    serviceAreasResult,
    driverServiceAreaAssignmentsResult,
    dispatchBookingsResult,
    dispatchOffersResult,
    schedulingSettingsResult,
    matchingSettingsResult,
    tripRatingsResult,
    pricingSettingsResult,
    driverEarningsSettingsResult,
    riderPaymentAttemptsResult,
    driverPayoutAccountsResult,
    driverBankPayoutsResult,
    driverPayoutTransferAllocationsResult,
    driverEarningTransfersResult,
    riderPaymentRefundsResult,
  ] = await Promise.all([
    supabase.from("tenants").select("*").eq("tenant_id", tenantId).single(),
    supabase.from("tenant_configurations").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("tenant_capabilities")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("capability_key", { ascending: true }),
    supabase
      .from("tenant_memberships")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("tenant_invitations")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_role_assignments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("tenant_audit_events")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("occurred_at", { ascending: false })
      .limit(12),
    supabase
      .from("driver_profiles")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase.from("driver_availability").select("*").eq("tenant_id", tenantId),
    supabase.from("driver_locations").select("*").eq("tenant_id", tenantId),
    supabase.from("driver_onboarding_checklists").select("*").eq("tenant_id", tenantId),
    supabase
      .from("driver_applications")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("driver_evidence")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("driver_evidence_requirements")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("evidence_type", { ascending: true }),
    supabase
      .from("notification_outbox")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("vehicles").select("*").eq("tenant_id", tenantId).order("created_at"),
    supabase
      .from("driver_vehicle_assignments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("vehicle_evidence")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("submitted_at", { ascending: false }),
    supabase
      .from("vehicle_evidence_requirements")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("evidence_type"),
    supabase.from("service_areas").select("*").eq("tenant_id", tenantId).order("name"),
    supabase
      .from("driver_service_area_assignments")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("dispatch_bookings")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("dispatch_offers")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("offered_at", { ascending: false }),
    supabase.from("tenant_scheduling_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("tenant_matching_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("trip_ratings").select("*").eq("tenant_id", tenantId).order("submitted_at", { ascending: false }),
    supabase.from("tenant_pricing_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("tenant_driver_earnings_settings").select("*").eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("rider_payment_attempts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("driver_payout_accounts").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("driver_bank_payouts").select("*").eq("tenant_id", tenantId).order("provider_created_at", { ascending: false }),
    supabase.from("driver_payout_transfer_allocations").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("driver_earning_transfers").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    supabase.from("rider_payment_refunds").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
  ]);

  if (tenantResult.error) {
    throw tenantResult.error;
  }

  if (configurationResult.error) {
    throw configurationResult.error;
  }

  if (capabilitiesResult.error) {
    throw capabilitiesResult.error;
  }

  if (membershipsResult.error) {
    throw membershipsResult.error;
  }

  if (invitationsResult.error) {
    throw invitationsResult.error;
  }

  if (roleAssignmentsResult.error) {
    throw roleAssignmentsResult.error;
  }

  if (auditResult.error) {
    throw auditResult.error;
  }

  if (driversResult.error && !driversResult.error.message.includes("driver_profiles")) {
    throw driversResult.error;
  }
  if (
    driverAvailabilityResult.error &&
    !driverAvailabilityResult.error.message.includes("driver_availability")
  ) {
    throw driverAvailabilityResult.error;
  }
  if (
    driverLocationsResult.error &&
    !driverLocationsResult.error.message.includes("driver_locations")
  )
    throw driverLocationsResult.error;
  if (
    onboardingResult.error &&
    !onboardingResult.error.message.includes("driver_onboarding_checklists")
  ) {
    throw onboardingResult.error;
  }
  if (applicationsResult.error && !applicationsResult.error.message.includes("driver_applications"))
    throw applicationsResult.error;
  if (evidenceResult.error && !evidenceResult.error.message.includes("driver_evidence"))
    throw evidenceResult.error;
  if (
    evidenceRequirementsResult.error &&
    !evidenceRequirementsResult.error.message.includes("driver_evidence_requirements")
  )
    throw evidenceRequirementsResult.error;
  if (
    notificationsResult.error &&
    !notificationsResult.error.message.includes("notification_outbox")
  )
    throw notificationsResult.error;
  if (vehiclesResult.error && !vehiclesResult.error.message.includes("vehicles"))
    throw vehiclesResult.error;
  if (
    assignmentsResult.error &&
    !assignmentsResult.error.message.includes("driver_vehicle_assignments")
  )
    throw assignmentsResult.error;
  if (
    vehicleEvidenceResult.error &&
    !vehicleEvidenceResult.error.message.includes("vehicle_evidence")
  )
    throw vehicleEvidenceResult.error;
  if (
    vehicleEvidenceRequirementsResult.error &&
    !vehicleEvidenceRequirementsResult.error.message.includes("vehicle_evidence_requirements")
  )
    throw vehicleEvidenceRequirementsResult.error;
  if (serviceAreasResult.error && !serviceAreasResult.error.message.includes("service_areas"))
    throw serviceAreasResult.error;
  if (
    driverServiceAreaAssignmentsResult.error &&
    !driverServiceAreaAssignmentsResult.error.message.includes("driver_service_area_assignments")
  )
    throw driverServiceAreaAssignmentsResult.error;
  if (
    dispatchBookingsResult.error &&
    !dispatchBookingsResult.error.message.includes("dispatch_bookings")
  )
    throw dispatchBookingsResult.error;
  if (dispatchOffersResult.error && !dispatchOffersResult.error.message.includes("dispatch_offers"))
    throw dispatchOffersResult.error;
  if (
    schedulingSettingsResult.error &&
    !schedulingSettingsResult.error.message.includes("tenant_scheduling_settings")
  )
    throw schedulingSettingsResult.error;
  if (
    matchingSettingsResult.error &&
    !matchingSettingsResult.error.message.includes("tenant_matching_settings")
  )
    throw matchingSettingsResult.error;
  if (tripRatingsResult.error && !tripRatingsResult.error.message.includes("trip_ratings"))
    throw tripRatingsResult.error;
  if (pricingSettingsResult.error && !pricingSettingsResult.error.message.includes("tenant_pricing_settings"))
    throw pricingSettingsResult.error;
  if (driverEarningsSettingsResult.error && !driverEarningsSettingsResult.error.message.includes("tenant_driver_earnings_settings"))
    throw driverEarningsSettingsResult.error;
  if (riderPaymentAttemptsResult.error && !riderPaymentAttemptsResult.error.message.includes("rider_payment_attempts"))
    throw riderPaymentAttemptsResult.error;
  if (driverPayoutAccountsResult.error && !driverPayoutAccountsResult.error.message.includes("driver_payout_accounts"))
    throw driverPayoutAccountsResult.error;
  if (driverBankPayoutsResult.error && !driverBankPayoutsResult.error.message.includes("driver_bank_payouts"))
    throw driverBankPayoutsResult.error;
  if (driverPayoutTransferAllocationsResult.error && !driverPayoutTransferAllocationsResult.error.message.includes("driver_payout_transfer_allocations"))
    throw driverPayoutTransferAllocationsResult.error;
  if (driverEarningTransfersResult.error && !driverEarningTransfersResult.error.message.includes("driver_earning_transfers"))
    throw driverEarningTransfersResult.error;
  if (riderPaymentRefundsResult.error && !riderPaymentRefundsResult.error.message.includes("rider_payment_refunds"))
    throw riderPaymentRefundsResult.error;

  const roleAssignments = roleAssignmentsResult.data ?? [];
  const memberships = await attachMembershipDetails(
    supabase,
    membershipsResult.data ?? [],
    roleAssignments,
  );

  return {
    tenant: tenantResult.data,
    configuration: configurationResult.data ?? null,
    capabilities: capabilitiesResult.data ?? [],
    memberships,
    invitations: invitationsResult.data ?? [],
    roleAssignments,
    auditEvents: auditResult.data ?? [],
    drivers: driversResult.data ?? [],
    driverAvailability: driverAvailabilityResult.data ?? [],
    driverLocations: driverLocationsResult.data ?? [],
    driverOnboarding: onboardingResult.data ?? [],
    driverApplications: applicationsResult.data ?? [],
    driverEvidence: evidenceResult.data ?? [],
    driverEvidenceRequirements: evidenceRequirementsResult.data ?? [],
    notifications: notificationsResult.data ?? [],
    vehicles: vehiclesResult.data ?? [],
    driverVehicleAssignments: assignmentsResult.data ?? [],
    vehicleEvidence: vehicleEvidenceResult.data ?? [],
    vehicleEvidenceRequirements: vehicleEvidenceRequirementsResult.data ?? [],
    serviceAreas: serviceAreasResult.data ?? [],
    driverServiceAreaAssignments: driverServiceAreaAssignmentsResult.data ?? [],
    dispatchBookings: dispatchBookingsResult.data ?? [],
    dispatchOffers: dispatchOffersResult.data ?? [],
    schedulingSettings: schedulingSettingsResult.data ?? null,
    matchingSettings: matchingSettingsResult.data ?? null,
    tripRatings: tripRatingsResult.data ?? [],
    pricingSettings: pricingSettingsResult.data ?? null,
    driverEarningsSettings: driverEarningsSettingsResult.data ?? null,
    riderPaymentAttempts: riderPaymentAttemptsResult.data ?? [],
    driverPayoutAccounts: driverPayoutAccountsResult.data ?? [],
    driverBankPayouts: driverBankPayoutsResult.data ?? [],
    driverPayoutTransferAllocations: driverPayoutTransferAllocationsResult.data ?? [],
    driverEarningTransfers: driverEarningTransfersResult.data ?? [],
    riderPaymentRefunds: riderPaymentRefundsResult.data ?? [],
  };
}

async function attachMembershipDetails(
  supabase: AdminSupabaseClient,
  memberships: TenantMembershipRow[],
  roleAssignments: readonly TenantRoleAssignmentRow[],
): Promise<MembershipWithRoles[]> {
  const visiblePeople = await loadTenantMemberDirectory(supabase, memberships[0]?.tenant_id);

  return memberships.map((membership) => ({
    ...membership,
    person: visiblePeople.get(membership.person_id),
    roles: roleAssignments.filter(
      ({ membership_id }) => membership_id === membership.membership_id,
    ),
  }));
}

async function loadTenantMemberDirectory(
  supabase: AdminSupabaseClient,
  tenantId: string | undefined,
): Promise<Map<string, TenantMemberDirectoryPerson>> {
  if (!tenantId) {
    return new Map();
  }

  const { data, error } = await supabase.rpc("tenant_member_directory", {
    target_tenant_id: tenantId,
  });

  if (error) {
    throw error;
  }

  return new Map(
    (data ?? []).map((person) => [
      person.person_id,
      {
        person_id: person.person_id,
        display_name: person.display_name,
        primary_email: person.primary_email,
        status: person.person_status,
      },
    ]),
  );
}

export function countPendingInvitations(invitations: readonly { status: string }[]) {
  return invitations.filter(({ status }) => status === "pending").length;
}

export function countActiveMemberships(memberships: readonly { status: string }[]) {
  return memberships.filter(({ status }) => status === "active").length;
}
