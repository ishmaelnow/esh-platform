export type DocumentReviewStatus =
  | "missing"
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "expiration_missing";

type DriverAvailabilityDocument = {
  evidenceType: string;
  requiredForActivation: boolean;
  reviewStatus: DocumentReviewStatus;
};

type VehicleAvailabilityDocument = {
  evidenceType: string;
  requiredForService: boolean;
  reviewStatus: DocumentReviewStatus;
};

export function evidenceLabel(evidenceType: string) {
  const labels: Record<string, string> = {
    personal_photo: "Personal photo",
    reference_document: "Reference document",
    vehicle_photo: "Onboarding vehicle evidence",
  };
  return labels[evidenceType] ?? evidenceType.replaceAll("_", " ");
}

export function vehicleEvidenceLabel(evidenceType: string) {
  const labels: Record<string, string> = {
    registration: "Vehicle registration",
    insurance: "Vehicle insurance",
    inspection: "Safety inspection",
    operating_permit: "Operating permit",
  };
  return labels[evidenceType] ?? evidenceType.replaceAll("_", " ");
}

export function availabilityBlockerLabel(blocker: string) {
  const labels: Record<string, string> = {
    driver_profile_missing: "Driver profile is unavailable",
    driver_not_active: "Driver account must be active",
    driver_documents_incomplete: "Driver documents must be approved and current",
    vehicle_not_assigned: "An active vehicle must be assigned",
    vehicle_not_active: "Assigned vehicle must be active",
    vehicle_documents_incomplete: "Vehicle documents must be approved and current",
    service_area_not_selected: "Select an operating service area",
    service_area_unavailable: "The selected service area is no longer available",
  };
  return labels[blocker] ?? blocker.replaceAll("_", " ");
}

export function availabilityBlockerDetails(
  blocker: string,
  driverDocuments: DriverAvailabilityDocument[],
  vehicleDocuments: VehicleAvailabilityDocument[],
) {
  if (blocker === "driver_documents_incomplete") {
    const issues = driverDocuments
      .filter((document) => document.requiredForActivation && document.reviewStatus !== "approved")
      .map(
        (document) =>
          `${evidenceLabel(document.evidenceType)}: ${documentIssueLabel(document.reviewStatus)}`,
      );
    if (issues.length > 0) return issues;
  }
  if (blocker === "vehicle_documents_incomplete") {
    const issues = vehicleDocuments
      .filter((document) => document.requiredForService && document.reviewStatus !== "approved")
      .map(
        (document) =>
          `${vehicleEvidenceLabel(document.evidenceType)}: ${documentIssueLabel(document.reviewStatus)}`,
      );
    if (issues.length > 0) return issues;
  }
  return [availabilityBlockerLabel(blocker)];
}

export function documentIssueLabel(status: DocumentReviewStatus) {
  const labels: Record<DocumentReviewStatus, string> = {
    missing: "document is missing",
    pending: "waiting for administrator approval",
    approved: "approved",
    rejected: "rejected; upload a replacement",
    expired: "document is expired",
    expiration_missing: "approved, but a future expiration date is required",
  };
  return labels[status];
}

export function availabilityErrorMessage(message: string) {
  const marker = "cannot go online:";
  if (!message.toLowerCase().includes(marker)) return message;
  const blockerText = message.slice(message.toLowerCase().indexOf(marker) + marker.length);
  return `Cannot go online. ${blockerText
    .split(",")
    .map((blocker) => availabilityBlockerLabel(blocker.trim()))
    .join("; ")}.`;
}
