// Reserved foundation product. Deliberately excluded from currently operable ProductWorkspaceKey.
export const STUDENT_TRANSPORTATION_PRODUCT = "student_transportation" as const;
export type StudentTransportationRole =
  | "student_transport_admin"
  | "student_transport_operator"
  | "student_transport_guardian"
  | "student_transport_school_admin";
export type StudentTransportationLaunchControls = {
  tenantId: string;
  operationsEnabled: false;
  createdAt: string;
};
export type StudentEnrollmentStatus = "draft" | "submitted" | "approved" | "rejected" | "withdrawn";
export type StudentEnrollment = {
  student_id: string;
  tenant_id: string;
  guardian_person_id: string;
  full_name: string;
  grade: string;
  school_name: string;
  guardian_phone: string;
  guardian_relationship: string;
  status: StudentEnrollmentStatus;
  authority_attested: boolean;
  review_notes: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};
export type StudentEnrollmentContact = {
  contact_id: string;
  tenant_id: string;
  student_id: string;
  full_name: string;
  phone: string;
  relationship: string;
  proposed_pickup: boolean;
  proposed_dropoff: boolean;
};
