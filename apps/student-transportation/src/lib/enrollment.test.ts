import { describe, expect, it } from "vitest";
import { blankEnrollment, readEnrollmentContext, enrollmentError } from "./enrollment";
describe("Student enrollment boundaries", () => {
  it("does not turn missing or malformed privileges into enrollment access", () => {
    expect(() => readEnrollmentContext(null)).toThrow();
    expect(() => readEnrollmentContext({ programs: [] })).toThrow();
    expect(
      readEnrollmentContext({
        personId: "self",
        programs: [{ tenantId: "other", canEnroll: "true" }],
      }).programs,
    ).toEqual([]);
  });
  it("new forms contain no example children, contacts or addresses", () => {
    expect(blankEnrollment().fullName).toBe("");
    expect(blankEnrollment().contacts).toEqual([]);
    expect(blankEnrollment().authorityAttested).toBe(false);
    expect(enrollmentError("save")).not.toMatch(/sql|TypeError|Supabase/);
  });
});
