import { describe, expect, it } from "vitest";
import { studentRequestError } from "./staff";

describe("Student workspace error display", () => {
  it("reports operation, HTTP status and safe code without raw provider details", () => {
    const error = studentRequestError(
      "Load staff access",
      {
        code: "PGRST301",
        message: "private token or database detail",
        details: "private student content",
      },
      401,
    );
    expect(error.message).toBe(
      "Load staff access: Authentication was rejected. (HTTP 401 / PGRST301)",
    );
    expect(error.message).not.toContain("private");
  });
  it("does not display arbitrary values masquerading as error codes", () => {
    expect(
      studentRequestError("Load staff access", { code: "sb_secret_DO_NOT_DISPLAY" }, 401).message,
    ).not.toContain("sb_secret");
    expect(
      studentRequestError("Load staff access", { code: "Bearer secret" }, 401).message,
    ).not.toContain("Bearer");
  });
  it("distinguishes service restriction, permission and connection failures", () => {
    expect(studentRequestError("Load staff access", {}, 402).message).toContain("restricted");
    expect(studentRequestError("Load staff access", {}, 403).message).toContain("denied");
    expect(studentRequestError("Load staff access", {}, 0).message).toContain("reach Supabase");
  });
  it("translates known key/token rejection messages without echoing credentials", () => {
    expect(
      studentRequestError("Load staff access", { message: "Invalid API key: PRIVATE" }, 401)
        .message,
    ).toBe("Load staff access: Supabase rejected the API key. (HTTP 401)");
    expect(
      studentRequestError("Load staff access", { message: "JWT expired PRIVATE" }, 401).message,
    ).toBe("Load staff access: The session token has expired. (HTTP 401)");
    expect(
      studentRequestError("Load staff access", { message: "Invalid JWT PRIVATE" }, 401).message,
    ).toBe("Load staff access: Supabase rejected the session token. (HTTP 401)");
  });
});
