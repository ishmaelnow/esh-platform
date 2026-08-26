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
            author_person_id: "p1",
            viewer_is_author: false,
            reaction_counts: { like: 2 },
            viewer_reactions: ["like"],
            comments: [
              {
                comment_id: "m1",
                body: "Hello",
                author_name: "Ada",
                author_person_id: "p2",
                viewer_is_author: false,
                created_at: "2026-08-23T00:01:00Z",
                reaction_counts: {},
                viewer_reactions: [],
              },
            ],
            media: [
              {
                media_id: "a1",
                storage_path: "t/u/x/photo.jpg",
                mime_type: "image/jpeg",
                alt_text: "Block party",
              },
            ],
          },
          { content_id: "c2", body: "" },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        contentId: "c1",
        body: "Welcome",
        authorName: "Ish",
        reactionCounts: { like: 2 },
        comments: [expect.objectContaining({ commentId: "m1" })],
        media: [expect.objectContaining({ mediaId: "a1" })],
      }),
    ]);
  });
});
