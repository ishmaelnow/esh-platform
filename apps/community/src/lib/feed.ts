import type {
  CommunityComment,
  CommunityFeedItem,
  CommunityMedia,
  CommunityReactionCounts,
  CommunityReactionKind,
  Json,
} from "@esh-platform/supabase";
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
        authorPersonId: asString(row.author_person_id),
        viewerIsAuthor: row.viewer_is_author === true,
        reactionCounts: parseReactionCounts(row.reaction_counts),
        viewerReactions: parseReactions(row.viewer_reactions),
        comments: asArray(row.comments).flatMap(parseComment),
        media: asArray(row.media).flatMap(parseMedia),
      },
    ];
  });
}
function parseComment(value: unknown): CommunityComment[] {
  const row = asRecord(value);
  const commentId = asString(row.comment_id);
  const body = asString(row.body);
  const createdAt = asString(row.created_at);
  if (!commentId || !body || !createdAt) return [];
  return [
    {
      commentId,
      parentCommentId: nullableString(row.parent_comment_id),
      body,
      authorName: asString(row.author_name) || "Community member",
      authorPersonId: asString(row.author_person_id),
      viewerIsAuthor: row.viewer_is_author === true,
      createdAt,
      reactionCounts: parseReactionCounts(row.reaction_counts),
      viewerReactions: parseReactions(row.viewer_reactions),
    },
  ];
}
function parseMedia(value: unknown): CommunityMedia[] {
  const row = asRecord(value);
  const mediaId = asString(row.media_id);
  const storagePath = asString(row.storage_path);
  const mimeType = asString(row.mime_type);
  if (!mediaId || !storagePath || !["image/jpeg", "image/png", "image/webp"].includes(mimeType))
    return [];
  return [
    {
      mediaId,
      storagePath,
      altText: nullableString(row.alt_text),
      mimeType: mimeType as CommunityMedia["mimeType"],
    },
  ];
}
function parseReactionCounts(value: unknown): CommunityReactionCounts {
  const row = asRecord(value);
  return Object.fromEntries(
    (["like", "support", "helpful"] as const).flatMap((kind) =>
      typeof row[kind] === "number" ? [[kind, row[kind]]] : [],
    ),
  );
}
function parseReactions(value: unknown): CommunityReactionKind[] {
  return asArray(value).filter(
    (item): item is CommunityReactionKind =>
      item === "like" || item === "support" || item === "helpful",
  );
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
