type Brand<TName extends string> = string & { readonly __brand: TName };

export type AuthenticationIdentityId = Brand<"AuthenticationIdentityId">;
export type PersonProfileId = Brand<"PersonProfileId">;
export type TenantId = Brand<"TenantId">;
export type TenantMembershipId = Brand<"TenantMembershipId">;
export type RoleId = Brand<"RoleId">;
export type PermissionId = Brand<"PermissionId">;
export type ActorId = Brand<"ActorId">;
export type CorrelationId = Brand<"CorrelationId">;

export type ActorType = "person" | "service_principal" | "platform_system";

export type AuthenticatedActor = {
  actorId: ActorId;
  actorType: ActorType;
  authIdentityId?: AuthenticationIdentityId;
  email?: string;
};

export type PersonStatus = "invited" | "active" | "suspended" | "deactivated" | "deleted";

export type PersonProfile = {
  personId: PersonProfileId;
  status: PersonStatus;
  displayName?: string;
  primaryEmail?: string;
  locale?: string;
  timeZone?: string;
  createdAt: string;
  updatedAt: string;
};

export const platformRoles = [
  "platform_owner",
  "platform_admin",
  "platform_support",
  "service_principal",
] as const;

export type PlatformRole = (typeof platformRoles)[number];

export const tenantRoles = ["tenant_owner", "tenant_admin", "tenant_member"] as const;

export type TenantRole = (typeof tenantRoles)[number];

export type PrincipalContext = {
  actor: AuthenticatedActor;
  personId?: PersonProfileId;
  personStatus?: PersonStatus;
  platformRoles: readonly PlatformRole[];
  isServiceRole: boolean;
};

export type TenantStatus =
  | "provisioning"
  | "active"
  | "suspended"
  | "closing"
  | "closed"
  | "deleted";

export type TenantConfiguration = {
  legalName: string;
  displayName: string;
  defaultTimeZone: string;
  supportContactEmail: string;
  brandingReference?: string;
};

export const tenantCapabilityKeys = [
  "tenant.memberships",
  "tenant.roles",
  "tenant.audit",
  "app.admin",
  "app.rider",
  "app.driver",
  "app.community",
  "community.content",
  "community.groups",
  "community.services",
  "community.moderation",
  "community.broadcasts",
] as const;

export type TenantCapabilityKey = (typeof tenantCapabilityKeys)[number];

export type TenantCapability = {
  key: TenantCapabilityKey;
  enabled: boolean;
};

export type Tenant = {
  tenantId: TenantId;
  status: TenantStatus;
  configuration: TenantConfiguration;
  capabilities: readonly TenantCapability[];
  createdAt: string;
  updatedAt: string;
};

export type TenantMembershipStatus = "invited" | "active" | "suspended" | "removed" | "expired";

export type TenantMembership = {
  membershipId: TenantMembershipId;
  tenantId: TenantId;
  personId: PersonProfileId;
  status: TenantMembershipStatus;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string;
  suspendedAt?: string;
  removedAt?: string;
  expiresAt?: string;
};

export type TenantInvitationStatus = "pending" | "accepted" | "cancelled" | "expired";

export type TenantInvitation = {
  invitationId: string;
  tenantId: TenantId;
  email: string;
  intendedRoles: readonly TenantRole[];
  status: TenantInvitationStatus;
  invitedBy: ActorId;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  cancelledAt?: string;
};

export type RoleScope = "platform" | "tenant";

export type PermissionKey = `${string}.${string}.${string}`;

export type Permission = {
  permissionId: PermissionId;
  key: PermissionKey;
  description?: string;
};

export type RoleAssignmentStatus = "pending" | "active" | "revoked" | "expired";

export type PlatformRoleAssignment = {
  assignmentId: string;
  scope: "platform";
  roleId: RoleId;
  role: PlatformRole;
  actorId: ActorId;
  status: RoleAssignmentStatus;
  assignedAt: string;
  assignedBy: ActorId;
  revokedAt?: string;
  expiresAt?: string;
};

export type TenantRoleAssignment = {
  assignmentId: string;
  scope: "tenant";
  tenantId: TenantId;
  membershipId: TenantMembershipId;
  roleId: RoleId;
  role: TenantRole;
  status: RoleAssignmentStatus;
  assignedAt: string;
  assignedBy: ActorId;
  revokedAt?: string;
  expiresAt?: string;
};

export type RoleAssignment = PlatformRoleAssignment | TenantRoleAssignment;

export type TenantContext = {
  tenantId: TenantId;
  tenantStatus: TenantStatus;
  membershipId?: TenantMembershipId;
  membershipStatus?: TenantMembershipStatus;
  tenantRoles: readonly TenantRole[];
  tenantCapabilities: readonly TenantCapability[];
  activeTenantSelectedAt?: string;
};

export type AuthorizationResourceScope =
  | { scope: "platform"; resourceType: string; resourceId?: string }
  | { scope: "tenant"; tenantId: TenantId; resourceType: string; resourceId?: string };

export type AuthorizationConstraint =
  | "read_only"
  | "own_record_only"
  | "tenant_owner_required"
  | "support_session_only";

export type AuthorizationDecisionReason =
  | "allowed"
  | "unauthenticated"
  | "person_inactive"
  | "missing_tenant"
  | "tenant_suspended"
  | "not_tenant_member"
  | "membership_inactive"
  | "forbidden"
  | "capability_disabled"
  | "cross_tenant_denied"
  | "business_identity_required"
  | "service_role_required";

export type AuthorizationRequest = {
  principal: PrincipalContext;
  tenant?: TenantContext;
  action: PermissionKey;
  resource: AuthorizationResourceScope;
  requiredPermission?: PermissionKey;
  requiredCapability?: TenantCapabilityKey;
  correlationId?: CorrelationId;
};

export type AuthorizationDecision =
  | {
      allowed: true;
      reason: "allowed";
      constraints?: readonly AuthorizationConstraint[];
      evaluatedPermissions?: readonly PermissionKey[];
      evaluatedCapabilities?: readonly TenantCapabilityKey[];
    }
  | {
      allowed: false;
      reason: Exclude<AuthorizationDecisionReason, "allowed">;
      constraints?: readonly AuthorizationConstraint[];
      evaluatedPermissions?: readonly PermissionKey[];
      evaluatedCapabilities?: readonly TenantCapabilityKey[];
    };

export type AuditActor = {
  actorId: ActorId;
  actorType: ActorType;
  personId?: PersonProfileId;
  platformRoles?: readonly PlatformRole[];
};

export type AuditResourceReference = {
  resourceType: string;
  resourceId: string;
  tenantId?: TenantId;
};

export type AuditContext = {
  actor: AuditActor;
  tenantId?: TenantId;
  reason: string;
  occurredAt: string;
  correlationId: CorrelationId;
  resource?: AuditResourceReference;
};

export function asAuthenticationIdentityId(value: string): AuthenticationIdentityId {
  return value as AuthenticationIdentityId;
}

export function asPersonProfileId(value: string): PersonProfileId {
  return value as PersonProfileId;
}

export function asTenantId(value: string): TenantId {
  return value as TenantId;
}

export function asTenantMembershipId(value: string): TenantMembershipId {
  return value as TenantMembershipId;
}

export function asRoleId(value: string): RoleId {
  return value as RoleId;
}

export function asPermissionId(value: string): PermissionId {
  return value as PermissionId;
}

export function asActorId(value: string): ActorId {
  return value as ActorId;
}

export function asCorrelationId(value: string): CorrelationId {
  return value as CorrelationId;
}

export const defaultV1TenantCapabilities = [
  { key: "tenant.memberships", enabled: true },
  { key: "tenant.roles", enabled: true },
  { key: "tenant.audit", enabled: true },
  { key: "app.admin", enabled: true },
  { key: "app.rider", enabled: false },
  { key: "app.driver", enabled: false },
  { key: "app.community", enabled: false },
  { key: "community.content", enabled: false },
  { key: "community.groups", enabled: false },
  { key: "community.services", enabled: false },
  { key: "community.moderation", enabled: false },
  { key: "community.broadcasts", enabled: false },
] as const satisfies readonly TenantCapability[];

export const communityRoleKeys = [
  "community_member",
  "community_moderator",
  "community_admin",
  "emergency_publisher",
] as const;

export type CommunityRoleKey = (typeof communityRoleKeys)[number];

export const communityPermissionKeys = [
  "community.content.create",
  "community.content.comment",
  "community.content.react",
  "community.events.submit",
  "community.submissions.create",
  "community.groups.participate",
  "community.services.manage_own",
  "community.content.moderate",
  "community.submissions.review",
  "community.events.approve",
  "community.services.moderate",
  "community.content.pin",
  "community.verifications.manage",
  "community.announcements.publish",
  "community.groups.manage",
  "community.alerts.urgent",
  "community.broadcasts.urgent",
  "community.broadcasts.important",
  "community.alerts.emergency",
  "community.broadcasts.emergency",
] as const;

export type CommunityPermissionKey = (typeof communityPermissionKeys)[number];
