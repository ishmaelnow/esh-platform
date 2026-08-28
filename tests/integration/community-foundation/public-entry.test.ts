import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
const migration = readFileSync("supabase/migrations/20260827000200_community_public_entry.sql", "utf8");
describe("Community public entry migration", () => {
  test("keeps visitor submissions separate from membership and content", () => {
    expect(migration).toContain("create table public.community_join_requests");
    expect(migration).toContain("create table public.community_public_feedback");
    expect(migration).toContain("community_public_enabled");
    expect(migration).toContain("submit_community_join_request");
    expect(migration).toContain("submit_community_public_feedback");
  });
});
