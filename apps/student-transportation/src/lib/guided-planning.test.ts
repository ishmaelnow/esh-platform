import { describe, expect, it } from "vitest";
import { currentBinding, stopReviews, studentSuggestions } from "./guided-planning";
import type { PlanningRecord } from "./planning";
const review = (overrides: Partial<PlanningRecord> = {}): PlanningRecord => ({
  id: "review",
  kind: "student",
  customerId: "school",
  reference: "school-reference",
  revision: 1,
  state: "active",
  data: { name: "TEST STUDENT" },
  actorId: "reviewer",
  recordedAt: "2026-11-20",
  reason: "TEST review",
  ...overrides,
});
describe("guided route review bindings", () => {
  it("suggests only same-school active student reviews and preserves ambiguity", () => {
    const records = [
      review(),
      review({ id: "second" }),
      review({ id: "other-school", customerId: "other" }),
      review({ id: "revoked", state: "revoked" }),
    ];
    expect(studentSuggestions(records, "school", " test student ").map((r) => r.id)).toEqual([
      "review",
      "second",
    ]);
    expect(currentBinding(records, undefined)).toBeUndefined();
  });
  it("reuses loading points only for the exact customer, request and source index", () => {
    const point = review({ kind: "point", data: { requestId: "request", stopIndex: 0 } });
    expect(stopReviews([point], "school", "request", 0)).toEqual([point]);
    expect(stopReviews([point], "other", "request", 0)).toEqual([]);
    expect(stopReviews([point], "school", "other-request", 0)).toEqual([]);
    expect(stopReviews([point], "school", "request", 1)).toEqual([]);
  });
  it("invalidates identity confirmation when its review is revised or revoked", () => {
    const binding = { id: "review", revision: 1 };
    expect(currentBinding([review()], binding)).toBeTruthy();
    expect(currentBinding([review({ revision: 2 })], binding)).toBeUndefined();
    expect(currentBinding([review({ state: "revoked" })], binding)).toBeUndefined();
  });
});
