import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync("supabase/migrations/20260827000100_community_service_listings.sql", "utf8");

describe("Community service directory migration", () => {
  test("keeps listings tenant isolated and RLS protected", () => {
    expect(migration).toContain("create table public.community_service_listings");
    expect(migration).toContain("alter table public.community_service_listings enable row level security");
    expect(migration).toContain("foreign key (tenant_id, provider_id)");
    expect(migration).toContain("community_public_enabled(target_tenant_id)");
  });
  test("requires provider permission and moderation before publication", () => {
    expect(migration).toContain("community.services.manage_own");
    expect(migration).toContain("community.services.moderate");
    expect(migration).toContain("review_community_service_listing");
    expect(migration).toContain("status = 'active'");
    expect(migration).toContain("A moderation reason is required");
  });
});
