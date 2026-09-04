import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const callback = readFileSync("src/app/auth/callback/page.tsx", "utf8");
const acceptanceRoute = readFileSync("src/app/api/invitations/accept/route.ts", "utf8");

describe("Community passwordless invitation callback contract", () => {
  it("keeps authentication and acceptance on the isolated Community origin", () => {
    expect(callback).toContain('createIsolatedBrowserSupabaseClient("esh-community-auth"');
    expect(callback).toContain("exchangeCodeForSession(code)");
    expect(callback).toContain('fetch("/api/invitations/accept"');
    expect(callback).not.toContain("admin.eshapp.com");
  });

  it("accepts with the authenticated user and no service-role client", () => {
    expect(acceptanceRoute).toContain("createAuthenticatedSupabaseClient");
    expect(acceptanceRoute).toContain("accept_tenant_invitation");
    expect(acceptanceRoute).not.toContain("createServiceSupabaseClient");
  });
});
