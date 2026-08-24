import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260824000200_fix_invitation_auth_identity_ambiguity.sql",
  ),
  "utf8",
);

describe("tenant invitation auth identity ambiguity fix", () => {
  test("resolves the local auth identity variable deliberately", () => {
    expect(migration).toContain("create or replace function public.accept_tenant_invitation");
    expect(migration).toContain("#variable_conflict use_variable");
    expect(migration).toContain("where pp.auth_user_id = auth_user_id");
  });

  test("preserves invitation email, membership, role, activation, and audit behavior", () => {
    expect(migration).toContain("invitation_record.normalized_email <> auth_email");
    expect(migration).toContain("insert into public.tenant_memberships");
    expect(migration).toContain("insert into public.tenant_role_assignments");
    expect(migration).toContain("public.tenant_has_active_owner");
    expect(migration).toContain("'tenant.invitation_accepted'");
  });
});
