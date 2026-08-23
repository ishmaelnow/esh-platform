import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260823000400_workspace_admin_read_model.sql"), "utf8");

describe("workspace administration read model", () => {
  test("uses governance authorization and caller-scoped access", () => {
    expect(migration).toContain("public.can_manage_workspace_access(target_tenant_id)");
    expect(migration).toContain("public.my_workspace_access()");
    expect(migration).toContain("membership.person_id = public.current_person_id()");
  });

  test("does not grant direct table access or mutate workspace state", () => {
    expect(migration).toContain("revoke all on function public.workspace_admin_snapshot");
    expect(migration).toContain("grant execute on function public.workspace_admin_snapshot(uuid) to authenticated");
    expect(migration).not.toContain("grant select on public.person_profiles");
    expect(migration).not.toContain("insert into public.tenant_workspace_enrollments");
  });
});
