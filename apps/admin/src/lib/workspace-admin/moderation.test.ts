import { describe, expect, test } from "vitest";
import { parseCommunityModerationSnapshot } from "./moderation";

describe("Community moderation snapshot", () => {
  test("keeps display-safe reports and rejects malformed records", () => {
    expect(
      parseCommunityModerationSnapshot({
        reports: [
          {
            report_id: "r1",
            target_type: "content",
            target_id: "c1",
            category: "spam",
            details: null,
            status: "open",
            created_at: "2026-08-25T00:00:00Z",
            reporter_name: "Ish",
            target_excerpt: "Repeated advertisement",
            target_author_name: "Provider",
          },
          { report_id: "r2", target_type: "unknown" },
        ],
      }),
    ).toEqual([
      expect.objectContaining({ reportId: "r1", category: "spam", targetType: "content" }),
    ]);
  });
});
