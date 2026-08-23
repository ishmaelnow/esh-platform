import type { Json, ProductWorkspaceKey, WorkspaceRoleKey } from "@esh-platform/supabase";

export type WorkspaceSummary = { workspaceKey: ProductWorkspaceKey; displayName: string; description: string; status: "disabled" | "enabled" | "suspended"; roles: WorkspaceRoleKey[] };
export type WorkspaceMember = { membershipId: string; personId: string; displayName: string; email: string };
export type WorkspaceEnrollment = { enrollmentId: string; membershipId: string; workspaceKey: ProductWorkspaceKey; status: string; displayName: string; email: string; roles: WorkspaceRoleKey[] };
export type WorkspaceAdminSnapshot = { canManage: boolean; workspaces: WorkspaceSummary[]; memberships: WorkspaceMember[]; enrollments: WorkspaceEnrollment[] };

const workspaceKeys = new Set(["transportation", "community"]);
const roleKeys = new Set(["transportation_admin", "community_member", "community_admin", "community_moderator", "emergency_publisher"]);

export function parseWorkspaceAdminSnapshot(value: Json): WorkspaceAdminSnapshot {
  const source = asRecord(value);
  return {
    canManage: source.can_manage === true,
    workspaces: asArray(source.workspaces).flatMap((item) => {
      const row = asRecord(item);
      if (!workspaceKeys.has(asString(row.workspace_key))) return [];
      return [{ workspaceKey: asString(row.workspace_key) as ProductWorkspaceKey, displayName: asString(row.display_name), description: asString(row.description), status: parseStatus(row.status), roles: parseRoles(row.roles) }];
    }),
    memberships: asArray(source.memberships).map((item) => {
      const row = asRecord(item);
      return { membershipId: asString(row.membership_id), personId: asString(row.person_id), displayName: asString(row.display_name), email: asString(row.email) };
    }),
    enrollments: asArray(source.enrollments).flatMap((item) => {
      const row = asRecord(item);
      if (!workspaceKeys.has(asString(row.workspace_key))) return [];
      return [{ enrollmentId: asString(row.enrollment_id), membershipId: asString(row.membership_id), workspaceKey: asString(row.workspace_key) as ProductWorkspaceKey, status: asString(row.status), displayName: asString(row.display_name), email: asString(row.email), roles: parseRoles(row.roles) }];
    }),
  };
}

export function rolesForWorkspace(workspaceKey: ProductWorkspaceKey) {
  return workspaceKey === "transportation" ? (["transportation_admin"] as const) : (["community_member", "community_admin", "community_moderator", "emergency_publisher"] as const);
}

function parseRoles(value: unknown) { return asArray(value).map(asString).filter((role): role is WorkspaceRoleKey => roleKeys.has(role)); }
function parseStatus(value: unknown): WorkspaceSummary["status"] { return value === "enabled" || value === "suspended" ? value : "disabled"; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function asString(value: unknown) { return typeof value === "string" ? value : ""; }
