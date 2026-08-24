import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260823000600_community_core_content.sql",
  "utf8",
);

describe("Community core content migration", () => {
  test("creates the envelope, typed records, targets, actions, and RLS", () => {
    for (const table of [
      "community_content_items",
      "community_posts",
      "community_announcements",
      "community_events",
      "community_alerts",
      "community_help_requests",
      "community_opportunities",
      "community_resources",
      "community_content_targets",
      "community_content_actions",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  test("keeps member creation narrow and product-session gated", () => {
    expect(migration).toContain("create_my_community_post");
    expect(migration).toContain("has_active_product_session(target_tenant_id, 'community')");
    expect(migration).toContain("can_read_community_content");
    expect(migration).toContain("item.publication_status = 'published'");
    expect(migration).toContain("item.moderation_status = 'clear'");
    expect(migration).toContain("protect_community_content_identity");
    expect(migration).toContain(
      "Official, priority, pin, moderation, and broadcast fields are not caller-controlled",
    );
    expect(migration).not.toContain(
      "grant insert on public.community_content_items to authenticated",
    );
  });
});
