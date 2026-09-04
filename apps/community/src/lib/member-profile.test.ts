import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("../../supabase/migrations/20260904000100_community_member_profiles.sql", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");

describe("Community member profiles", () => {
  it("keeps profile records tenant-scoped and member-owned", () => {
    expect(migration).toContain("create table public.community_member_profiles");
    expect(migration).toContain("foreign key (membership_id, tenant_id)");
    expect(migration).toContain("public.can_operate_community(target_tenant_id)");
    expect(migration).toContain("community_member_profiles_read");
  });

  it("supports profile item and photo lifecycle operations", () => {
    for (const operation of [
      "add_my_community_profile_item",
      "update_my_community_profile_item",
      "remove_my_community_profile_item",
      "attach_my_community_profile_avatar",
      "remove_my_community_profile_avatar",
    ]) expect(migration).toContain(operation);
    expect(page).toContain("Add profile item");
    expect(page).toContain("Remove photo");
  });
});
