import type { CommunityModerationReport, Json } from "@esh-platform/supabase";

export function parseCommunityModerationSnapshot(value: Json): CommunityModerationReport[] {
  const source = record(value);
  return array(source.reports).flatMap((entry) => {
    const row = record(entry);
    const reportId = string(row.report_id);
    const targetId = string(row.target_id);
    const targetType = row.target_type;
    const status = row.status;
    if (
      !reportId ||
      !targetId ||
      (targetType !== "content" && targetType !== "comment") ||
      (status !== "open" && status !== "reviewing")
    )
      return [];
    return [
      {
        reportId,
        targetType,
        targetId,
        category: string(row.category),
        details: nullable(row.details),
        status,
        createdAt: string(row.created_at),
        reporterName: string(row.reporter_name) || "Community member",
        targetExcerpt: string(row.target_excerpt),
        targetAuthorName: string(row.target_author_name) || "Community member",
      },
    ];
  });
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function nullable(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
