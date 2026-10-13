import { expect, it } from "vitest";
import { riderRatingLabel } from "./rider-rating";
it("distinguishes confirmed Rider averages, unrated Riders and unavailable data", () => {
  expect(riderRatingLabel({ average: 4.25, count: 4 })).toBe("★ 4.25 · 4 ratings");
  expect(riderRatingLabel({ average: 5, count: 1 })).toBe("★ 5.00 · 1 rating");
  expect(riderRatingLabel({ average: null, count: 0 })).toBe("Not yet rated");
  for (const value of [null, undefined, [], {}, { count: 0, average: 0 }, { count: -1, average: 4 },
    { count: 1.2, average: 4 }, { count: 1, average: NaN }, { count: 1, average: 6 }, { count: 1, average: "4" }])
    expect(riderRatingLabel(value)).toBe("Rating unavailable");
});
