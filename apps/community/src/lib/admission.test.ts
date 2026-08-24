import { describe, expect, test } from "vitest";
import { eligibleCommunityRows } from "./admission";

describe("Community product admission", () => {
  test("rejects unrelated product access and Community access without a role", () => {
    expect(
      eligibleCommunityRows([
        {
          workspace_key: "transportation",
          tenant_id: "tenant-1",
          role_keys: ["transportation_admin"],
        },
        { workspace_key: "community", tenant_id: "tenant-1", role_keys: [] },
      ]),
    ).toEqual([]);
  });

  test("admits only explicit Community access with an active role", () => {
    expect(
      eligibleCommunityRows([
        {
          workspace_key: "community",
          tenant_id: "tenant-1",
          role_keys: ["community_member"],
        },
      ]),
    ).toHaveLength(1);
  });
});
