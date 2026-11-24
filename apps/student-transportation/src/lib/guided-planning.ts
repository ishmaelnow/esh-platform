import type { PlanningRecord } from "./planning";

export type ReviewBinding = { id: string; revision: number };

/** A suggestion is never an identity confirmation. Keep revision in every binding. */
export function studentSuggestions(records: PlanningRecord[], customerId: string, name: string) {
  return records.filter(
    (r) =>
      r.kind === "student" &&
      r.state === "active" &&
      r.customerId === customerId &&
      typeof r.data.name === "string" &&
      r.data.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase(),
  );
}

export function stopReviews(
  records: PlanningRecord[],
  customerId: string,
  requestId: string,
  index: number,
) {
  return records.filter(
    (r) =>
      r.kind === "point" &&
      r.state === "active" &&
      r.customerId === customerId &&
      r.data.requestId === requestId &&
      r.data.stopIndex === index,
  );
}

export function currentBinding(records: PlanningRecord[], binding: ReviewBinding | undefined) {
  return (
    binding &&
    records.find(
      (r) => r.id === binding.id && r.revision === binding.revision && r.state === "active",
    )
  );
}
