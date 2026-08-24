export type ProductWorkspaceKey = "transportation" | "community";
export type TenantWorkspaceStatus = "disabled" | "enabled" | "suspended";
export type WorkspaceEnrollmentStatus = "active" | "suspended" | "removed" | "expired";
export type WorkspaceRoleKey =
  | "transportation_admin"
  | "community_member"
  | "community_admin"
  | "community_moderator"
  | "emergency_publisher";

export type MyWorkspaceAccess = {
  tenant_id: string;
  membership_id: string;
  workspace_key: ProductWorkspaceKey;
  workspace_name: string;
  role_keys: WorkspaceRoleKey[];
};

export type ProductOperationalSessionStatus = "active" | "ended" | "expired" | "superseded";
export type ProductOperationalSession = {
  productSessionId: string;
  personId: string;
  authSessionId: string;
  tenantId: string;
  workspaceKey: ProductWorkspaceKey;
  status: ProductOperationalSessionStatus;
  activatedAt: string;
  heartbeatAt: string;
  expiresAt: string;
  endedAt: string | null;
  endReason: string | null;
};
