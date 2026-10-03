import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applicationStatusLabel, missingApplicationFiles, validateApplicationFile, type DriverApplicationStatus } from "./application";

const migration = readFileSync(new URL("../../../../supabase/migrations/20261002000100_driver_applicant_portal.sql", import.meta.url), "utf8");
const application: DriverApplicationStatus = { applicationId: "fixture", tenantSlug: "fixture", companyName: "Fixture company", fullName: "Fixture applicant", phone: null, submittedAt: "2026-10-02", status: "submitted", documents: [] };

describe("Applicant evidence and status", () => {
  it("distinguishes incomplete submission from complete receipt", () => {
    expect(applicationStatusLabel(application)).toBe("Finish your application");
    const complete = { ...application, documents: ["personal_photo", "vehicle_photo", "reference_document", "insurance"].map((type) => ({ type, status: "pending", fileName: "fixture.jpg", reviewNotes: null })) };
    expect(applicationStatusLabel(complete)).toBe("Application received"); expect(missingApplicationFiles(complete)).toEqual([]);
  });
  it("preserves reviewed evidence rather than listing it as missing", () => {
    expect(missingApplicationFiles({ ...application, documents: [{ type: "personal_photo", status: "rejected", fileName: "fixture.jpg", reviewNotes: "Review reason" }] }).map((file) => file.type)).toEqual(["vehicle_photo", "reference_document", "insurance"]);
  });
  it("accepts actual PNG and PDF signatures only in appropriate fields", async () => {
    await expect(validateApplicationFile(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "fixture.png", { type: "image/png" }), "personal_photo")).resolves.toBeUndefined();
    const pdf = new File(["%PDF-1.7\nfixture"], "fixture.pdf", { type: "application/pdf" });
    await expect(validateApplicationFile(pdf, "reference_document")).resolves.toBeUndefined();
    await expect(validateApplicationFile(pdf, "insurance")).resolves.toBeUndefined();
    await expect(validateApplicationFile(pdf, "personal_photo")).rejects.toThrow("JPEG or PNG");
  });
  it("rejects empty and excessive evidence before uploads", async () => {
    await expect(validateApplicationFile(new File([], "empty.jpg", { type: "image/jpeg" }), "personal_photo")).rejects.toThrow("1 MB");
    await expect(validateApplicationFile(new File([new Uint8Array(1_000_001)], "large.jpg", { type: "image/jpeg" }), "personal_photo")).rejects.toThrow("1 MB");
  });
});

// Source contract checks supplement API mocks. Execute the documented transactional SQL test on
// an owner-controlled local Supabase database to verify database behavior before release.
describe("Driver applicant migration contracts", () => {
  it("scopes status to verified auth identity and omits private storage and internal reviewer identifiers", () => {
    const status = migration.slice(0, migration.indexOf("-- Trusted Driver server only"));
    expect(status).toContain("a.applicant_auth_user_id = applicant_id"); expect(status).toContain("u.email_confirmed_at is not null");
    expect(status).not.toContain("'storage_path'"); expect(status).not.toContain("'reviewed_by_person_id'");
    expect(status).toContain("from public, anon");
  });
  it("restricts submission to server role, active company and confirmed identity", () => {
    expect(migration).toContain("from public, anon, authenticated"); expect(migration).toContain("to service_role;");
    expect(migration).toContain("t.status = 'active'"); expect(migration).toContain("cap.capability_key = 'driver.management' and cap.enabled");
    expect(migration).toContain("where u.id = applicant_user_id and u.email_confirmed_at is not null");
  });
  it("serializes submission with approval and retries, and requires all evidence atomically", () => {
    expect(migration).toContain("pg_advisory_xact_lock"); expect(migration).toContain("limit 1 for update");
    expect(migration).toContain("app.application_status <> 'submitted'"); expect(migration).toContain("All four application files are required");
    expect(migration).toContain("'driver.application_evidence_submitted'"); expect(migration).toContain("storage.objects");
  });
  it("requires application insurance but hands it to vehicle review without copying approval", () => {
    expect(migration).toContain("Vehicle insurance document is required");
    expect(migration).toContain("foreign key (tenant_id, driver_application_id)");
    expect(migration).toContain("foreign key (tenant_id, vehicle_evidence_id)");
    expect(migration).toContain("public.can_manage_vehicle_management(app.tenant_id)");
    expect(migration).toContain("This vehicle is not assigned to this applicant");
    expect(migration).toContain("Insurance is already linked to a different vehicle");
    const link = migration.slice(migration.indexOf("create or replace function public.link_driver_application_insurance"));
    expect(link).not.toContain("'approved',"); expect(link).toContain("'driver.application_insurance_linked'");
    expect(link).toContain("vehicle_insurance_serialize_upload");
  });
});
