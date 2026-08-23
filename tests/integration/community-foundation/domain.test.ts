import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260823000200_community_places_organizations_trust.sql",
  ),
  "utf8",
);

describe("Community places, organizations, and trust migration", () => {
  test("creates all tenant-owned tables with RLS", () => {
    for (const table of [
      "community_areas",
      "community_groups",
      "community_group_memberships",
      "community_organizations",
      "community_organization_memberships",
      "community_provider_profiles",
      "community_organization_verifications",
      "community_provider_verifications",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  test("uses tenant-aware relationships and private verification reads", () => {
    expect(migration).toContain("foreign key (tenant_id, organization_id)");
    expect(migration).toContain("foreign key (membership_id, tenant_id)");
    expect(migration).toContain("community_organization_verifications_owner_or_manager_select");
    expect(migration).toContain("community_provider_verifications_owner_or_manager_select");
    expect(migration).not.toContain(
      "grant select on public.community_organization_verifications to anon",
    );
  });

  test("exposes controlled audited operations rather than table writes", () => {
    for (const operation of [
      "create_community_area",
      "create_community_group",
      "create_community_organization",
      "create_my_community_provider",
      "submit_community_organization_verification",
      "submit_community_provider_verification",
      "review_community_verification",
    ]) {
      expect(migration).toContain(`create or replace function public.${operation}`);
      expect(migration).toContain(`revoke all on function public.${operation}`);
    }
    expect(migration).toContain("community.verification_reviewed");
    expect(migration).toContain("tenant_audit_events");
  });
});
