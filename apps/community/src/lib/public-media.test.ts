import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("../../supabase/migrations/20260904000500_community_public_media_signing.sql", "utf8");

describe("public Community media access", () => {
  it("uses a narrow security-definer visibility check", () => {
    expect(migration).toContain("can_read_public_community_media");
    expect(migration).toContain("media.moderation_status = 'clear'");
    expect(migration).toContain("public.can_read_community_content");
    expect(migration).toContain("to anon, authenticated");
  });
});
