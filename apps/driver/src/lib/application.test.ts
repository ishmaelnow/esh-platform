import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applicationStatusLabel, missingApplicationFiles, validateApplicationFile, type DriverApplicationStatus } from "./application";

const migration = readFileSync(new URL("../../../../supabase/migrations/20261003000100_application_insurance_review.sql", import.meta.url), "utf8");
const idMigration = readFileSync(new URL("../../../../supabase/migrations/20261003000200_driver_id_photo.sql", import.meta.url), "utf8");
const application: DriverApplicationStatus = { applicationId: "fixture", tenantSlug: "fixture", companyName: "Fixture company", fullName: "Fixture applicant", phone: null, submittedAt: "2026-10-02", status: "submitted", documents: [] };

describe("Applicant evidence and status", () => {
  it("distinguishes incomplete submission from complete receipt", () => {
    expect(applicationStatusLabel(application)).toBe("Finish your application");
    const complete = { ...application, documents: ["personal_photo", "driver_id_photo", "vehicle_photo", "reference_document", "insurance"].map((type) => ({ type, status: "pending", fileName: "fixture.jpg", reviewNotes: null })) };
    expect(applicationStatusLabel(complete)).toBe("Application received"); expect(missingApplicationFiles(complete)).toEqual([]);
  });
  it("preserves reviewed evidence rather than listing it as missing", () => {
    expect(missingApplicationFiles({ ...application, documents: [{ type: "personal_photo", status: "rejected", fileName: "fixture.jpg", reviewNotes: "Review reason" }] }).map((file) => file.type)).toEqual(["driver_id_photo", "vehicle_photo", "reference_document", "insurance"]);
  });
  it("accepts actual PNG and PDF signatures only in appropriate fields", async () => {
    await expect(validateApplicationFile(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "fixture.png", { type: "image/png" }), "personal_photo")).resolves.toBeUndefined();
    const pdf = new File(["%PDF-1.7\nfixture"], "fixture.pdf", { type: "application/pdf" });
    await expect(validateApplicationFile(pdf, "reference_document")).resolves.toBeUndefined();
    await expect(validateApplicationFile(pdf, "insurance")).resolves.toBeUndefined();
    await expect(validateApplicationFile(pdf, "personal_photo")).rejects.toThrow("JPEG or PNG");
    await expect(validateApplicationFile(pdf, "driver_id_photo")).rejects.toThrow("JPEG or PNG");
  });
  it("rejects empty and excessive evidence before uploads", async () => {
    await expect(validateApplicationFile(new File([], "empty.jpg", { type: "image/jpeg" }), "personal_photo")).rejects.toThrow("1 MB");
    await expect(validateApplicationFile(new File([new Uint8Array(1_000_001)], "large.jpg", { type: "image/jpeg" }), "personal_photo")).rejects.toThrow("1 MB");
  });
});

// Source contract checks supplement API mocks. Execute the documented transactional SQL test on
// an owner-controlled local Supabase database to verify database behavior before release.
describe("Driver applicant migration contracts", () => {
  it("adds ID separately, requires five files and preserves existing activation requirements and records", () => {
    expect(idMigration).toContain("array['personal_photo', 'driver_id_photo', 'vehicle_photo', 'reference_document', 'insurance']");
    expect(idMigration).toContain("All five application files are required");
    expect(idMigration).toContain("not between 1 and 5");
    expect(idMigration).toContain("'driver_id_photo', false, false");
    expect(idMigration).toContain("from public, anon, authenticated");
    expect(idMigration).toContain("app.application_status <> 'submitted'");
    expect(idMigration).toContain("pg_advisory_xact_lock");
    expect(idMigration).not.toContain("update public.driver_evidence");
    expect(idMigration).not.toContain("delete from");
  });
  it("scopes status to verified auth identity and omits private storage and internal reviewer identifiers", () => {
    const status = migration.slice(migration.indexOf("create or replace function public.my_driver_applications()"), migration.indexOf("-- Trusted Driver server only"));
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
  it("restores insurance to original evidence review and preserves files and existing reviews", () => {
    expect(migration).toContain("array['personal_photo', 'vehicle_photo', 'reference_document', 'insurance']");
    expect(migration).toContain("i.storage_bucket, i.storage_path, i.original_file_name");
    expect(migration).toContain("coalesce(v.review_status, 'pending')");
    expect(migration).toContain("a.driver_profile_id");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).not.toContain("insert into public.vehicle_evidence");
    expect(migration).not.toContain("drop table");
    const submission = migration.slice(migration.indexOf("-- Trusted Driver server only"));
    expect(submission).not.toContain("insert into public.driver_application_insurance");
    expect(submission).toContain("insert into public.driver_evidence");
  });
});
