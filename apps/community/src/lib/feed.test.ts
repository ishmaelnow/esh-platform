import { describe, expect, test } from "vitest";
import { parseCommunityFeed } from "./feed";
describe("Community feed parser", () => {
  test("accepts display-safe rows and ignores malformed rows", () => {
    expect(
      parseCommunityFeed({
        items: [
          {
            content_id: "c1",
            content_kind: "post",
            title: null,
            body: "Welcome",
            visibility: "members",
            priority: "normal",
            published_at: "2026-08-23T00:00:00Z",
            expires_at: null,
            author_name: "Ish",
          },
          { content_id: "c2", body: "" },
        ],
      }),
    ).toEqual([expect.objectContaining({ contentId: "c1", body: "Welcome", authorName: "Ish" })]);
  });
});
