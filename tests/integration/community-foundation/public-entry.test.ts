import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
const migration = readFileSync("supabase/migrations/20260827000200_community_public_entry.sql", "utf8");
const recoveryMigration = readFileSync(
  "supabase/migrations/20260903000100_recover_community_approval_invitations.sql",
  "utf8",
);
describe("Community public entry migration", () => {
  test("keeps visitor submissions separate from membership and content", () => {
    expect(migration).toContain("create table public.community_join_requests");
    expect(migration).toContain("create table public.community_public_feedback");
    expect(migration).toContain("community_public_enabled");
    expect(migration).toContain("submit_community_join_request");
    expect(migration).toContain("submit_community_public_feedback");
  });

  test("keeps approved requests visible until their Community invitation exists", () => {
    expect(recoveryMigration).toContain("request.status = 'approved'");
    expect(recoveryMigration).toContain("not exists");
    expect(recoveryMigration).toContain("invitation.workspace_key = 'community'");
    expect(recoveryMigration).toContain("invitation.workspace_role_key = 'community_member'");
  });
});
