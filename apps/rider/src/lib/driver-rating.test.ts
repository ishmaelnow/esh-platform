import { expect, it } from "vitest";
import { driverRatingLabel } from "./driver-rating";

it("shows confirmed averages/counts without fabricating a score for missing or invalid data", () => {
  expect(driverRatingLabel({ average: 4.25, count: 4 })).toBe("★ 4.25 · 4 ratings");
  expect(driverRatingLabel({ average: 5, count: 1 })).toBe("★ 5.00 · 1 rating");
  expect(driverRatingLabel({ average: null, count: 0 })).toBe("Not yet rated");
  for (const value of [null, undefined, [], {}, { count: 0, average: 0 }, { count: -1, average: 4 },
    { count: 1.2, average: 4 }, { count: 1, average: NaN }, { count: 1, average: 6 }, { count: 1, average: "4" }])
    expect(driverRatingLabel(value)).toBe("Rating unavailable");
});
