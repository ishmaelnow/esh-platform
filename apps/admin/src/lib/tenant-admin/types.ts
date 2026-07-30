import type {
  ActiveTenantPreferenceRow,
  PersonProfileRow,
  TenantAuditEventRow,
  TenantCapabilityRow,
  TenantConfigurationRow,
  TenantInvitationRow,
  TenantMembershipRow,
  TenantRoleAssignmentRow,
  TenantRow,
  DriverProfileRow,
  DriverAvailabilityRow,
  DriverOnboardingChecklistRow,
  DriverApplicationRow,
  DriverEvidenceRequirementRow,
  DriverEvidenceRow,
  NotificationOutboxRow,
  VehicleRow,
  DriverVehicleAssignmentRow,
  VehicleEvidenceRow,
  VehicleEvidenceRequirementRow,
  ServiceAreaRow,
  DriverServiceAreaAssignmentRow,
} from "@esh-platform/supabase";

export const foundationTenantRoles = ["tenant_owner", "tenant_admin", "tenant_member"] as const;

export type FoundationTenantRole = (typeof foundationTenantRoles)[number];

export type EditableTenantConfiguration = Pick<
  TenantConfigurationRow,
  | "display_name"
  | "legal_name"
  | "default_time_zone"
  | "support_contact_email"
  | "branding_reference"
>;

export type TenantMemberDirectoryPerson = Pick<
  PersonProfileRow,
  "person_id" | "display_name" | "primary_email" | "status"
>;

export type MembershipWithRoles = TenantMembershipRow & {
  person: TenantMemberDirectoryPerson | undefined;
  roles: TenantRoleAssignmentRow[];
};

export type TenantSummary = {
  tenant: TenantRow;
  configuration: TenantConfigurationRow | null;
  capabilities: TenantCapabilityRow[];
  memberships: MembershipWithRoles[];
  invitations: TenantInvitationRow[];
  roleAssignments: TenantRoleAssignmentRow[];
  auditEvents: TenantAuditEventRow[];
  drivers: DriverProfileRow[];
  driverAvailability: DriverAvailabilityRow[];
  driverOnboarding: DriverOnboardingChecklistRow[];
  driverApplications: DriverApplicationRow[];
  driverEvidence: DriverEvidenceRow[];
  driverEvidenceRequirements: DriverEvidenceRequirementRow[];
  notifications: NotificationOutboxRow[];
  vehicles: VehicleRow[];
  driverVehicleAssignments: DriverVehicleAssignmentRow[];
  vehicleEvidence: VehicleEvidenceRow[];
  vehicleEvidenceRequirements: VehicleEvidenceRequirementRow[];
  serviceAreas: ServiceAreaRow[];
  driverServiceAreaAssignments: DriverServiceAreaAssignmentRow[];
};

export type ActiveTenantOption = {
  membership: TenantMembershipRow;
  tenant: TenantRow;
  configuration: TenantConfigurationRow | null;
  roles: FoundationTenantRole[];
};

export type PrincipalTenantContext = {
  person: PersonProfileRow;
  memberships: ActiveTenantOption[];
  selectedTenantId: string | null;
  selectedMembershipId: string | null;
  preference: ActiveTenantPreferenceRow | null;
};

export type TenantContextResolution =
  | {
      status: "ready";
      context: PrincipalTenantContext;
      selectedTenant: ActiveTenantOption;
    }
  | {
      status: "signed_in_without_profile";
    }
  | {
      status: "no_active_memberships";
      context: PrincipalTenantContext;
    }
  | {
      status: "tenant_selection_required";
      context: PrincipalTenantContext;
    };

export type MutationResult =
  | {
      ok: true;
      message?: string;
    }
  | {
      ok: false;
      message: string;
    };
