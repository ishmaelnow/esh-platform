export type EnrollmentProgram = {
  tenantId: string;
  name: string;
  canEnroll: boolean;
  canReview: boolean;
  canConfigure: boolean;
  enrollmentEnabled: boolean;
};
export type EnrollmentContext = { personId: string; programs: EnrollmentProgram[] };
export type ContactInput = {
  fullName: string;
  phone: string;
  relationship: string;
  pickup: boolean;
  dropoff: boolean;
};
export type EnrollmentInput = {
  fullName: string;
  grade: string;
  schoolName: string;
  guardianPhone: string;
  relationship: string;
  authorityAttested: boolean;
  contacts: ContactInput[];
};
export const blankEnrollment = (): EnrollmentInput => ({
  fullName: "",
  grade: "",
  schoolName: "",
  guardianPhone: "",
  relationship: "",
  authorityAttested: false,
  contacts: [],
});
export function readEnrollmentContext(value: unknown): EnrollmentContext {
  if (
    !value ||
    typeof value !== "object" ||
    !("programs" in value) ||
    !Array.isArray(value.programs) ||
    !("personId" in value) ||
    typeof value.personId !== "string"
  )
    throw new Error("Enrollment access unavailable");
  const programs = value.programs.filter((row: unknown): row is EnrollmentProgram => {
    if (!row || typeof row !== "object") return false;
    return (
      "tenantId" in row &&
      typeof row.tenantId === "string" &&
      "name" in row &&
      typeof row.name === "string" &&
      "canEnroll" in row &&
      typeof row.canEnroll === "boolean" &&
      "canReview" in row &&
      typeof row.canReview === "boolean" &&
      "canConfigure" in row &&
      typeof row.canConfigure === "boolean" &&
      "enrollmentEnabled" in row &&
      typeof row.enrollmentEnabled === "boolean"
    );
  });
  return { personId: value.personId, programs };
}
export function enrollmentError(action: "load" | "save" | "access" | "auth") {
  return action === "auth"
    ? "We could not complete sign-in. Please try again."
    : action === "load"
      ? "We could not load enrollment. Refresh or contact your program administrator."
      : action === "access"
        ? "Access could not be updated. Check that the person is an existing active member of this organization."
        : "We could not save this change. Check your entries and enrollment access, then try again.";
}
