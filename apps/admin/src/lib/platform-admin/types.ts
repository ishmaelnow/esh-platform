import type {
  PlatformRoleAssignmentRow,
  TenantCapabilityRow,
  TenantConfigurationRow,
  TenantInvitationRow,
  TenantProductEntitlementRow,
  TenantRow,
} from "@esh-platform/supabase";

export const platformProvisioningRoles = ["platform_owner", "platform_admin"] as const;

export type PlatformProvisioningRole = (typeof platformProvisioningRoles)[number];

export type PlatformTenantListItem = {
  tenant: TenantRow;
  configuration: TenantConfigurationRow | null;
  capabilities: TenantCapabilityRow[];
  invitations: TenantInvitationRow[];
  entitlements: TenantProductEntitlementRow[];
};

export type PlatformAdminSummary = {
  roles: PlatformRoleAssignmentRow[];
  tenants: PlatformTenantListItem[];
};

export type TenantProvisioningPayload = {
  displayName: string;
  legalName: string;
  defaultTimeZone: string;
  supportContactEmail: string;
  brandingReference: string | null;
  firstOwnerEmail: string;
  reason: string;
};

export type PlatformTenantActionPayload = {
  tenantId: string;
  reason: string;
};

export type ProductEntitlementActionPayload = PlatformTenantActionPayload & {
  workspaceKey: "transportation" | "community";
  status: "granted" | "suspended" | "revoked";
};
