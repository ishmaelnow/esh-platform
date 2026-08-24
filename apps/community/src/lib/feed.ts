import type { CommunityFeedItem, Json } from "@esh-platform/supabase";
export function parseCommunityFeed(value: Json): CommunityFeedItem[] {
  const source = asRecord(value);
  return asArray(source.items).flatMap((item) => {
    const row = asRecord(item);
    const contentId = asString(row.content_id);
    const body = asString(row.body);
    const publishedAt = asString(row.published_at);
    if (!contentId || !body || !publishedAt) return [];
    return [
      {
        contentId,
        contentKind: asString(row.content_kind),
        title: nullableString(row.title),
        body,
        visibility: parseVisibility(row.visibility),
        priority: parsePriority(row.priority),
        publishedAt,
        expiresAt: nullableString(row.expires_at),
        authorName: asString(row.author_name) || "Community member",
      },
    ];
  });
}
function parseVisibility(value: unknown): CommunityFeedItem["visibility"] {
  return value === "public" || value === "group_private" ? value : "members";
}
function parsePriority(value: unknown): CommunityFeedItem["priority"] {
  return value === "important" || value === "urgent" || value === "emergency" ? value : "normal";
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function nullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
