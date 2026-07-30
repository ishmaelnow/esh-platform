import { describe, expect, test } from "vitest";
import { createServiceSupabaseClient } from "@esh-platform/supabase";
import { loadTenantSummary } from "../../../apps/admin/src/lib/tenant-admin/queries";
import {
  createInvitationTokenHash,
  normalizeEmail,
} from "../../../apps/admin/src/lib/tenant-admin/server";

const RUN_ADMIN_INTEGRATION_TESTS = process.env.RUN_SUPABASE_ADMIN_TESTS === "true";
const url = process.env.ADMIN_INTEGRATION_SUPABASE_URL;
const serviceRoleKey = process.env.ADMIN_INTEGRATION_SUPABASE_SERVICE_ROLE_KEY;

const runOrSkip = RUN_ADMIN_INTEGRATION_TESTS && url && serviceRoleKey ? test : test.skip;

describe("Tenant Administration core workflows", () => {
  runOrSkip("loads tenant summary and performs foundation mutations", async () => {
    const supabase = createServiceSupabaseClient({
      NEXT_PUBLIC_SUPABASE_URL: url!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "unused-by-service-client",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey!,
    });
    const suffix = crypto.randomUUID();
    const personId = crypto.randomUUID();
    const tenantId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    const serviceAreaId = crypto.randomUUID();

    try {
      await expect(
        supabase.from("person_profiles").insert({
          person_id: personId,
          status: "active",
          primary_email: `admin-${suffix}@example.test`,
          normalized_email: `admin-${suffix}@example.test`,
          display_name: "Integration Admin",
          activated_at: new Date().toISOString(),
        }),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("tenants").insert({
          tenant_id: tenantId,
          status: "provisioning",
        }),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("tenant_configurations").insert({
          tenant_id: tenantId,
          legal_name: "Integration Tenant LLC",
          display_name: "Integration Tenant",
          default_time_zone: "America/Chicago",
          support_contact_email: "support@example.test",
        }),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("tenant_capabilities").insert(
          [
            "tenant.memberships",
            "tenant.roles",
            "tenant.audit",
            "app.admin",
            "app.rider",
            "app.driver",
          ].map((capability_key) => ({
            tenant_id: tenantId,
            capability_key,
            enabled: !["app.rider", "app.driver"].includes(capability_key),
          })),
        ),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("tenant_memberships").insert({
          membership_id: membershipId,
          tenant_id: tenantId,
          person_id: personId,
          status: "active",
          activated_at: new Date().toISOString(),
        }),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("tenant_role_assignments").insert({
          tenant_id: tenantId,
          membership_id: membershipId,
          role_key: "tenant_owner",
          status: "active",
          assigned_at: new Date().toISOString(),
        }),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("tenants").update({ status: "active" }).eq("tenant_id", tenantId),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("tenant_invitations").insert({
          tenant_id: tenantId,
          email: "invitee@example.test",
          normalized_email: normalizeEmail("invitee@example.test"),
          invitation_token_hash: createInvitationTokenHash(),
          intended_role: "tenant_member",
          status: "pending",
          invited_by_person_id: personId,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      ).resolves.toMatchObject({ error: null });

      await expect(
        supabase.from("service_areas").insert({
          service_area_id: serviceAreaId,
          tenant_id: tenantId,
          name: "Integration Coverage",
          center_latitude: 32.7767,
          center_longitude: -96.797,
          radius_km: 25,
          created_by_person_id: personId,
          updated_by_person_id: personId,
        }),
      ).resolves.toMatchObject({ error: null });

      const summary = await loadTenantSummary(supabase, tenantId);

      expect(summary.configuration?.display_name).toBe("Integration Tenant");
      expect(summary.memberships).toHaveLength(1);
      expect(summary.invitations).toHaveLength(1);
      expect(summary.serviceAreas).toMatchObject([
        { service_area_id: serviceAreaId, name: "Integration Coverage", status: "active" },
      ]);
      expect(
        summary.capabilities.find(({ capability_key }) => capability_key === "app.driver")?.enabled,
      ).toBe(false);
      expect(
        summary.driverEvidenceRequirements
          .filter(({ required_for_activation }) => required_for_activation)
          .map(({ evidence_type }) => evidence_type)
          .sort(),
      ).toEqual(["personal_photo", "reference_document"]);

      await expect(
        supabase
          .from("tenant_configurations")
          .update({ display_name: "Updated Integration Tenant" })
          .eq("tenant_id", tenantId),
      ).resolves.toMatchObject({ error: null });

      const updated = await loadTenantSummary(supabase, tenantId);

      expect(updated.configuration?.display_name).toBe("Updated Integration Tenant");
    } finally {
      await supabase.from("tenants").update({ status: "closing" }).eq("tenant_id", tenantId);
      await supabase.from("driver_service_area_assignments").delete().eq("tenant_id", tenantId);
      await supabase.from("service_areas").delete().eq("tenant_id", tenantId);
      await supabase.from("tenant_role_assignments").delete().eq("tenant_id", tenantId);
      await supabase.from("tenant_memberships").delete().eq("tenant_id", tenantId);
      await supabase.from("tenant_invitations").delete().eq("tenant_id", tenantId);
      await supabase.from("tenant_capabilities").delete().eq("tenant_id", tenantId);
      await supabase.from("tenant_audit_events").delete().eq("tenant_id", tenantId);
      await supabase.from("tenant_configurations").delete().eq("tenant_id", tenantId);
      await supabase.from("tenants").delete().eq("tenant_id", tenantId);
      await supabase.from("person_profiles").delete().eq("person_id", personId);
    }
  });
});
