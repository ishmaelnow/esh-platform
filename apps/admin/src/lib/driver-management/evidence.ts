export const driverEvidenceTypes = [
  "personal_photo",
  "driver_id_photo",
  "vehicle_photo",
  "reference_document",
  "insurance",
] as const;

export type DriverEvidenceType = (typeof driverEvidenceTypes)[number];
export function driverDocumentLabel(type: string) {
  return type === "personal_photo" ? "Profile photo"
    : type === "driver_id_photo" ? "Driver ID photo"
    : type === "vehicle_photo" ? "Vehicle photo"
    : type === "reference_document" ? "Vehicle registration document"
    : type === "insurance" ? "Vehicle insurance document" : type.replaceAll("_", " ");
}
export function driverDocumentRank(type: string) {
  const rank = driverEvidenceTypes.findIndex((entry) => entry === type);
  return rank < 0 ? driverEvidenceTypes.length : rank;
}

export function applicationReviewEvidence<T extends {
  tenant_id: string;
  driver_application_id: string | null;
  driver_profile_id: string | null;
  evidence_type: string;
  submitted_at: string;
  created_at: string;
}>(application: {
  tenant_id: string;
  driver_application_id: string;
  driver_profile_id: string | null;
}, records: readonly T[]): T[] {
  return records.filter((record) =>
    record.tenant_id === application.tenant_id &&
    (record.driver_application_id === application.driver_application_id ||
      (application.driver_profile_id !== null && record.driver_profile_id === application.driver_profile_id)),
  ).sort((a, b) =>
    driverDocumentRank(a.evidence_type) - driverDocumentRank(b.evidence_type) ||
    Date.parse(b.submitted_at) - Date.parse(a.submitted_at) ||
    Date.parse(b.created_at) - Date.parse(a.created_at),
  );
}
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
