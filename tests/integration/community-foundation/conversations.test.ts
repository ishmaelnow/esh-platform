import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260825000100_community_conversations_safety.sql",
  "utf8",
);

describe("Community conversations and safety migration", () => {
  test("creates every interaction and safety table with RLS", () => {
    for (const table of [
      "community_comments",
      "community_content_reactions",
      "community_comment_reactions",
      "community_user_blocks",
      "community_user_mutes",
      "community_reports",
      "community_media_assets",
      "community_content_media",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  test("keeps mutations narrow, session-gated, and rate limited", () => {
    expect(migration).toContain("public.can_operate_community(target_tenant_id)");
    expect(migration).toContain("Comment limit reached");
    expect(migration).toContain("Report limit reached");
    expect(migration).toContain("community_actor_hidden");
    expect(migration).toContain("my_community_safety_snapshot");
    expect(migration).not.toContain("grant insert on public.community_comments");
    expect(migration).not.toContain("grant insert on public.community_reports");
  });

  test("builds an empty-safe nested comment feed without reserved aliases", () => {
    expect(migration).toContain(") order by cmt.created_at), '[]'::jsonb)");
    expect(migration).toContain("from public.community_comments cmt");
    expect(migration).not.toContain("from public.community_comments comment\n");
  });

  test("uses private bounded media and rechecks readable content", () => {
    expect(migration).toContain("'community-media', 'community-media', false, 5242880");
    expect(migration).toContain("allowed_mime_types");
    expect(migration).toContain("object.metadata ->> 'mimetype' = mime_type_value");
    expect(migration).toContain(
      "public.can_read_community_content(attachment.tenant_id, attachment.content_id)",
    );
  });

  test("requires moderator authorization, a reason, and audit evidence", () => {
    expect(migration).toContain("public.can_moderate_community(report_row.tenant_id)");
    expect(migration).toContain("'community.report_moderated'");
    expect(migration).toContain(
      "decision_value not in ('dismiss', 'restrict', 'remove', 'restore')",
    );
    expect(migration).toContain("resolved_by_person_id = actor_id");
  });
});
