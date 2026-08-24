import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../../supabase/migrations/20260824000100_platform_product_entitlements.sql",
  ),
  "utf8",
);

describe("platform product entitlement migration", () => {
  test("creates a platform-owned RLS-protected entitlement boundary", () => {
    expect(migration).toContain("create table public.tenant_product_entitlements");
    expect(migration).toContain(
      "alter table public.tenant_product_entitlements enable row level security",
    );
    expect(migration).toContain("public.is_platform_data_admin()");
    expect(migration).not.toContain(
      "grant insert on public.tenant_product_entitlements to authenticated",
    );
    expect(migration).not.toContain(
      "grant update on public.tenant_product_entitlements to authenticated",
    );
  });

  test("grandfathers only already-enabled products", () => {
    expect(migration).toContain("where workspace.status = 'enabled'");
    expect(migration).toContain("'product_entitlement.grandfathered'");
    expect(migration).not.toMatch(
      /insert into public\.tenant_product_entitlements[\s\S]{0,350}'community'/,
    );
  });

  test("requires entitlement for product access and tenant activation", () => {
    expect(migration).toContain(
      "public.has_active_product_entitlement(target_tenant_id, target_workspace_key)",
    );
    expect(migration).toContain(
      "Platform product entitlement is required before tenant activation",
    );
    expect(migration).toContain("join public.tenant_product_entitlements entitlement");
    expect(migration).toContain("and entitlement.status = 'granted'");
  });

  test("ends active product sessions and audits suspension or revocation", () => {
    expect(migration).toContain("update public.product_operational_sessions set");
    expect(migration).toContain("'product_entitlement.status_changed'");
    expect(migration).toContain("'previous_status', prior_status");
  });

  test("provisions the Community capability bundle without activating or enrolling it", () => {
    expect(migration).toContain("'app.community', 'community.content'");
    expect(migration).toContain("'community.moderation', 'community.broadcasts'");
    expect(migration).not.toContain("insert into public.tenant_workspace_enrollments");
  });
});
