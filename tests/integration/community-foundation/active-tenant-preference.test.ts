import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260824000300_fix_active_tenant_preference_switch.sql",
  ),
  "utf8",
);

describe("active tenant preference switching fix", () => {
  test("removes tenant immutability from the mutable preference pointer", () => {
    expect(migration).toContain(
      "drop trigger if exists active_tenant_preferences_prevent_tenant_id_change",
    );
    expect(migration).not.toContain("execute function public.prevent_tenant_id_change");
  });

  test("keeps preference ownership immutable", () => {
    expect(migration).toContain("protect_active_tenant_preference_person");
    expect(migration).toContain("new.person_id is distinct from old.person_id");
    expect(migration).toContain("revoke all on function");
  });
});
