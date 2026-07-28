export const driverEvidenceTypes = [
  "personal_photo",
  "reference_document",
  "vehicle_photo",
] as const;

export type DriverEvidenceType = (typeof driverEvidenceTypes)[number];
export type DriverEvidenceReviewStatus = "approved" | "rejected";
export type DriverEvidenceReview = {
  status: DriverEvidenceReviewStatus;
  notes: string | null;
  expiresOn: string | null;
};

export function parseDriverEvidenceReview(input: Record<string, unknown>): DriverEvidenceReview {
  const status = input.status;
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const expiresOn =
    typeof input.expiresOn === "string" && input.expiresOn.trim() ? input.expiresOn.trim() : null;

  if (status !== "approved" && status !== "rejected") {
    throw new Error("Review status must be approved or rejected.");
  }

  if (status === "rejected" && !notes) {
    throw new Error("A rejection reason is required.");
  }

  if (expiresOn && !isIsoDate(expiresOn)) {
    throw new Error("Expiration date must be a valid date using YYYY-MM-DD.");
  }

  return {
    status,
    notes: notes || null,
    expiresOn,
  };
}

export function isEvidenceCurrentlyApproved(
  evidence: { reviewStatus: string; expiresOn: string | null },
  today: string,
) {
  return (
    evidence.reviewStatus === "approved" &&
    (evidence.expiresOn === null || evidence.expiresOn >= today)
  );
}

export function validateEvidenceExpiration(
  review: DriverEvidenceReview,
  expirationRequired: boolean,
  today: string,
) {
  if (
    review.status === "approved" &&
    expirationRequired &&
    (!review.expiresOn || review.expiresOn <= today)
  ) {
    throw new Error("A future expiration date is required for this evidence type.");
  }
  return review;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
