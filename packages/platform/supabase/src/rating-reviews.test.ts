import { expect, it } from "vitest";
import { readRatingReviews, reviewStatus } from "./rating-reviews";
it("rejects missing data instead of falsely offering duplicate requests", () => {
  for (const value of [null, {}, [{}], [{ status: "unknown" }]]) expect(() => readRatingReviews(value)).toThrow();
  expect(readRatingReviews([])).toEqual([]);
});
it("keeps only owned review fields and maps explicit decision labels", () => {
  const row = { appealId: "TEST appeal", bookingId: "TEST booking", status: "removed", reason: "TEST reason", resolutionNotes: "TEST explanation", submittedAt: "2026-10-13", resolvedAt: "2026-10-13" };
  expect(readRatingReviews([{ ...row, secret: "PRIVATE" }])).toEqual([row]);
  expect(reviewStatus("submitted")).toBe("Under review"); expect(reviewStatus("upheld")).toBe("Rating kept"); expect(reviewStatus("removed")).toBe("Rating removed");
});
