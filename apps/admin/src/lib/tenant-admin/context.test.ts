import { describe, expect, it } from "vitest";
import { adminAuthRefreshMode, chooseInitialTenant, hasFoundationTenantRole } from "./context";
import type { ActiveTenantOption } from "./types";

const tenantA = createOption("tenant-a", "membership-a");
const tenantB = createOption("tenant-b", "membership-b");

describe("chooseInitialTenant", () => {
  it("returns null when no active memberships exist", () => {
    expect(chooseInitialTenant([], null)).toBeNull();
  });

  it("auto-selects the only active membership", () => {
    expect(chooseInitialTenant([tenantA], null)).toBe(tenantA);
  });

  it("uses a valid persisted preference only when it still matches an active membership", () => {
    expect(
      chooseInitialTenant([tenantA, tenantB], {
        tenant_id: "tenant-b",
        membership_id: "membership-b",
      }),
    ).toBe(tenantB);
  });

  it("requires explicit selection when a preference does not match active authorization", () => {
    expect(
      chooseInitialTenant([tenantA, tenantB], {
        tenant_id: "tenant-c",
        membership_id: "membership-c",
      }),
    ).toBeNull();
  });
});

describe("hasFoundationTenantRole", () => {
  it("allows approved foundation tenant roles", () => {
    expect(hasFoundationTenantRole(["tenant_admin"], ["tenant_owner", "tenant_admin"])).toBe(true);
  });

  it("does not treat future business identities as foundation roles", () => {
    expect(hasFoundationTenantRole(["driver"], ["tenant_owner", "tenant_admin"])).toBe(false);
  });
});

describe("Admin authentication refresh stability", () => {
  it("does not reload the workspace when browser refocus repeats SIGNED_IN", () => {
    expect(adminAuthRefreshMode("SIGNED_IN", "user-a", "user-a")).toBe("none");
    expect(adminAuthRefreshMode("TOKEN_REFRESHED", "user-a", "user-a")).toBe("none");
  });

  it("reloads for a genuinely different identity without blocking routine profile updates", () => {
    expect(adminAuthRefreshMode("SIGNED_IN", "user-a", "user-b")).toBe("blocking");
    expect(adminAuthRefreshMode("SIGNED_OUT", "user-a", null)).toBe("blocking");
    expect(adminAuthRefreshMode("USER_UPDATED", "user-a", "user-a")).toBe("background");
  });
});

function createOption(tenantId: string, membershipId: string): ActiveTenantOption {
  return {
    membership: {
      membership_id: membershipId,
      tenant_id: tenantId,
      person_id: `person-${tenantId}`,
      status: "active",
      created_at: "2026-07-11T00:00:00.000Z",
      updated_at: "2026-07-11T00:00:00.000Z",
      invited_at: null,
      activated_at: "2026-07-11T00:00:00.000Z",
      suspended_at: null,
      removed_at: null,
      expires_at: null,
      created_by_person_id: null,
      updated_by_person_id: null,
    },
    tenant: {
      tenant_id: tenantId,
      status: "active",
      created_at: "2026-07-11T00:00:00.000Z",
      updated_at: "2026-07-11T00:00:00.000Z",
      activated_at: "2026-07-11T00:00:00.000Z",
      suspended_at: null,
      closing_at: null,
      closed_at: null,
      deleted_at: null,
      anonymized_at: null,
    },
    configuration: null,
    roles: ["tenant_member"],
  };
}
