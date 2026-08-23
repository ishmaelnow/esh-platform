import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260823000300_product_workspace_foundation.sql",
  ),
  "utf8",
);

describe("Product workspace foundation migration", () => {
  test("creates explicit tenant workspace enrollment and role boundaries", () => {
    for (const table of [
      "product_workspace_catalog",
      "workspace_role_catalog",
      "tenant_product_workspaces",
      "tenant_workspace_enrollments",
      "tenant_workspace_role_assignments",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("foreign key (membership_id, tenant_id)");
    expect(migration).toContain("foreign key (workspace_key, role_key)");
  });

  test("does not derive Community access from tenant, Rider, or Driver roles", () => {
    const replacement = migration.slice(migration.lastIndexOf("create or replace function public.has_community_permission"));
    expect(replacement).toContain("has_active_workspace_enrollment(target_tenant_id, 'community')");
    expect(replacement).toContain("has_workspace_role(");
    expect(replacement).not.toContain("role_permission.role_key = 'community_member'");
    expect(replacement).not.toContain("array['tenant_owner', 'tenant_admin']");
    expect(replacement).not.toContain("driver_profiles");
    expect(replacement).not.toContain("rider_profiles");
  });

  test("preserves existing Transportation administrators without Community enrollment", () => {
    expect(migration).toContain("'transportation_admin'");
    expect(migration).toContain("role.role_key in ('tenant_owner', 'tenant_admin')");
    expect(migration).toContain("workspace.transportation_access_backfilled");
    expect(migration).not.toMatch(
      /insert into public\.tenant_workspace_enrollments[\s\S]{0,500}'community'/,
    );
  });

  test("exposes narrow audited management operations", () => {
    for (const operation of [
      "set_tenant_workspace_status",
      "enroll_tenant_workspace_member",
      "assign_workspace_role",
      "remove_tenant_workspace_enrollment",
    ]) {
      expect(migration).toContain(`create or replace function public.${operation}`);
      expect(migration).toContain(`revoke all on function public.${operation}`);
    }
    expect(migration).toContain("workspace.member_enrolled");
    expect(migration).toContain("workspace.member_removed");
  });
});
