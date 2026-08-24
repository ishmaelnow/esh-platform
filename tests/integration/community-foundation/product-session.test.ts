import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const migration = readFileSync(resolve(__dirname, "../../../supabase/migrations/20260823000500_exclusive_product_sessions.sql"), "utf8");

describe("exclusive operational product sessions", () => {
  test("allows only one active product session per person", () => {
    expect(migration).toContain("create table public.product_operational_sessions");
    expect(migration).toContain("product_operational_sessions_one_active_person_idx");
    expect(migration).toContain("where status = 'active'");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  test("binds the lease to server-derived identity and auth session", () => {
    expect(migration).toContain("auth.jwt() ->> 'session_id'");
    expect(migration).toContain("public.current_person_id()");
    expect(migration).toContain("public.current_auth_session_id()");
    expect(migration).not.toContain("target_person_id");
    expect(migration).not.toContain("target_auth_session_id");
  });

  test("supersedes prior context and audits entry exit and replacement", () => {
    expect(migration).toContain("status = 'superseded'");
    expect(migration).toContain("product_session.entered");
    expect(migration).toContain("product_session.ended");
    expect(migration).toContain("product_session.superseded");
  });

  test("requires Transportation tenant roles to have an active Transportation lease", () => {
    const replacement = migration.slice(migration.indexOf("create or replace function public.has_tenant_role"));
    expect(replacement).toContain("has_active_product_session(target_tenant_id, 'transportation')");
    expect(replacement).toContain("not exists (select 1 from public.product_operational_sessions)");
    expect(migration).toContain("has_foundation_tenant_role(target_tenant_id, array['tenant_owner'])");
  });

  test("exposes controlled RPCs without direct client writes", () => {
    for (const operation of ["enter_my_product_session", "refresh_my_product_session", "leave_my_product_session"]) {
      expect(migration).toContain(`create or replace function public.${operation}`);
      expect(migration).toContain(`revoke all on function public.${operation}`);
    }
    expect(migration).not.toContain("grant insert on public.product_operational_sessions to authenticated");
    expect(migration).not.toContain("grant update on public.product_operational_sessions to authenticated");
  });
});
