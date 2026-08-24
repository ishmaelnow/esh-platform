import { describe, expect, test } from "vitest";
import {
  availableOperationalWorkspaces,
  eligibleTransportationRows,
  parseWorkspaceAdminSnapshot,
  rolesForWorkspace,
} from "./types";

describe("workspace administration contracts", () => {
  test("parses the read model and ignores unknown roles", () => {
    expect(
      parseWorkspaceAdminSnapshot({
        can_manage: true,
        workspaces: [
          {
            workspace_key: "community",
            display_name: "Community",
            description: "Board",
            status: "disabled",
            entitlement_status: "granted",
            roles: [],
          },
        ],
        memberships: [
          {
            membership_id: "m1",
            person_id: "p1",
            display_name: "Owner",
            email: "owner@example.com",
          },
        ],
        enrollments: [
          {
            enrollment_id: "e1",
            membership_id: "m1",
            workspace_key: "transportation",
            status: "active",
            display_name: "Owner",
            email: "owner@example.com",
            roles: ["transportation_admin", "unknown"],
          },
        ],
      }),
    ).toMatchObject({
      canManage: true,
      workspaces: [{ workspaceKey: "community", status: "disabled", entitlementStatus: "granted" }],
      enrollments: [{ roles: ["transportation_admin"] }],
    });
  });

  test("keeps Transportation and Community role choices separate", () => {
    expect(rolesForWorkspace("transportation")).toEqual(["transportation_admin"]);
    expect(rolesForWorkspace("community")).not.toContain("transportation_admin");
  });

  test("shows only enabled products with an assigned role in operational entry", () => {
    expect(
      availableOperationalWorkspaces([
        {
          workspaceKey: "transportation",
          displayName: "Transportation",
          description: "Dispatch",
          status: "enabled",
          entitlementStatus: "granted",
          roles: ["transportation_admin"],
        },
        {
          workspaceKey: "community",
          displayName: "Community",
          description: "Community",
          status: "disabled",
          entitlementStatus: "granted",
          roles: [],
        },
      ]),
    ).toEqual([
      {
        workspaceKey: "transportation",
        displayName: "Transportation",
        description: "Dispatch",
        status: "enabled",
        entitlementStatus: "granted",
        roles: ["transportation_admin"],
      },
    ]);
  });

  test("admits only explicit Transportation administrators", () => {
    expect(
      eligibleTransportationRows([
        {
          tenant_id: "transport-tenant",
          membership_id: "transport-member",
          workspace_key: "transportation",
          workspace_name: "Transportation",
          role_keys: ["transportation_admin"],
        },
        {
          tenant_id: "community-tenant",
          membership_id: "community-member",
          workspace_key: "community",
          workspace_name: "Community",
          role_keys: ["community_admin"],
        },
      ]),
    ).toHaveLength(1);
  });
});
