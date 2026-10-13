export type RatingReview = { appealId: string; bookingId: string; status: "submitted" | "upheld" | "removed"; reason: string; resolutionNotes: string | null; submittedAt: string; resolvedAt: string | null };
export function reviewStatus(status: RatingReview["status"]) {
  return status === "submitted" ? "Under review" : status === "upheld" ? "Rating kept" : "Rating removed";
}
export function readRatingReviews(value: unknown): RatingReview[] {
  if (!Array.isArray(value)) throw new Error("Reviews unavailable");
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Reviews unavailable");
    const r = item as Record<string, unknown>;
    if (!["appealId", "bookingId", "reason", "submittedAt"].every((key) => typeof r[key] === "string")
      || !["submitted", "upheld", "removed"].includes(String(r.status))
      || (r.resolutionNotes !== null && typeof r.resolutionNotes !== "string")
      || (r.resolvedAt !== null && typeof r.resolvedAt !== "string")) throw new Error("Reviews unavailable");
    return { appealId: r.appealId as string, bookingId: r.bookingId as string, status: r.status as RatingReview["status"],
      reason: r.reason as string, resolutionNotes: r.resolutionNotes, submittedAt: r.submittedAt as string, resolvedAt: r.resolvedAt };
  });
}
