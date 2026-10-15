// Actual new migrations and existing identity helpers in an isolated embedded database.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
async function main() {
  const db = new PGlite();
  const read = (file) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  const rows = async (sql, values) => (await db.query(sql, values)).rows;
  const actor = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(n)]);
    await db.exec("set role authenticated");
  };
  const payload = {
    fullName: "TEST CHILD A",
    grade: "3",
    schoolName: "TEST SCHOOL",
    guardianPhone: "2025550101",
    relationship: "Guardian",
    authorityAttested: true,
    contacts: [
      {
        fullName: "TEST CONTACT",
        phone: "2025550102",
        relationship: "Guardian",
        pickup: true,
        dropoff: true,
      },
    ],
  };
  const save = async (request, id = null, action = "save", body = payload, tenant = uuid(1)) =>
    (
      await rows("select save_my_student_enrollment($1,$2,$3,$4,$5) as id", [
        tenant,
        request,
        id,
        action,
        body,
      ])
    )[0].id;
  const review = async (id, request, decision, notes = "") =>
    rows("select review_student_enrollment($1,$2,$3,$4,$5) as id", [
      uuid(1),
      id,
      request,
      decision,
      notes,
    ]);
  const grant = async (n, role, enabled = true) =>
    rows("select set_student_enrollment_access($1,$2,$3,$4,$5)", [
      uuid(1),
      `student-test-${String(n)}@example.invalid`,
      role,
      enabled,
      enabled
        ? role === "guardian"
          ? "guardian_invitation"
          : "reviewer_assignment"
        : "access_revoked",
    ]);
  const configure = (enabled) =>
    rows("select configure_student_enrollment_program($1,$2,$3)", [
      uuid(1),
      enabled,
      enabled ? "pilot_setup" : "program_paused",
    ]);
  try {
    await db.exec(read("tooling/sql/student-transportation-bootstrap.sql"));
    await db.exec(read("supabase/migrations/20261014000100_student_transportation_foundation.sql"));
    await db.exec(read("tooling/sql/student-enrollment-bootstrap.sql"));
    const existing = read("supabase/migrations/20260711000300_tenant_foundation_rls.sql");
    for (const name of [
      "current_person_id",
      "has_active_platform_role",
      "is_platform_data_admin",
      "has_active_tenant_membership",
    ]) {
      const match = existing.match(
        new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$;`),
      );
      assert.ok(match, name);
      await db.exec(match[0]);
    }
    await db.exec(read("supabase/migrations/20261014000200_student_guardian_enrollment.sql"));
    await db.exec(
      "alter table tenant_memberships add column membership_id uuid default gen_random_uuid(); create table tenant_role_assignments(tenant_id uuid,membership_id uuid,role_key text,status text,expires_at timestamptz)",
    );
    const sessions = read("supabase/migrations/20260823000500_exclusive_product_sessions.sql");
    const foundationRole = sessions.match(
      /create or replace function public\.has_foundation_tenant_role\([\s\S]*?\$\$;/,
    );
    assert.ok(foundationRole);
    await db.exec(foundationRole[0]);
    await db.exec(
      read("supabase/migrations/20261015000100_student_enrollment_owner_governance.sql"),
    );
    await actor(11);
    await assert.rejects(save(randomUUID()), /Guardian enrollment access required/);
    await assert.rejects(configure(true), /governance membership required/);
    await actor(13);
    await grant(11, "guardian");
    await grant(12, "guardian");
    await actor(11);
    await assert.rejects(save(randomUUID()), /Guardian enrollment access required/);
    await actor(13);
    await configure(true);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    // Platform admin has no implicit reviewer access.
    await assert.rejects(review(uuid(99), randomUUID(), "approved"), /reviewer access required/);
    await grant(13, "reviewer");
    await actor(11);
    const request = randomUUID();
    const first = await save(request);
    assert.equal(await save(request), first);
    await assert.rejects(
      save(request, null, "save", { ...payload, fullName: "CHANGED" }),
      /already used/,
    );
    assert.equal((await rows("select * from student_transportation_students")).length, 1);
    await assert.rejects(
      save(randomUUID(), first, "submit", { ...payload, authorityAttested: false }),
      /guardian authority/,
    );
    await assert.rejects(
      save(randomUUID(), first, "submit", { ...payload, contacts: [] }),
      /at least one contact/,
    );
    await assert.rejects(
      save(randomUUID(), first, "save", {
        ...payload,
        contacts: [{ ...payload.contacts[0], phone: "bad" }],
      }),
      /check constraint/,
    );
    assert.equal(
      (await rows("select full_name from student_transportation_students"))[0].full_name,
      payload.fullName,
    );
    assert.equal((await rows("select * from student_transportation_contacts")).length, 1);
    await assert.rejects(
      save(randomUUID(), first, "save", { ...payload, guardianPhone: "-------" }),
      /check constraint/,
    );
    await save(randomUUID(), first, "submit");
    await assert.rejects(save(randomUUID(), first, "save"), /Withdraw before/);
    const second = await save(randomUUID(), null, "submit", {
      ...payload,
      fullName: "TEST SIBLING",
    });
    assert.notEqual(first, second);
    assert.equal((await rows("select * from student_transportation_students")).length, 2);
    await assert.rejects(
      db.exec("update student_transportation_students set status='approved'"),
      /permission denied/,
    );
    await actor(12);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    assert.equal((await rows("select * from student_transportation_contacts")).length, 0);
    await assert.rejects(save(randomUUID(), first), /Owned enrollment required/);
    await assert.rejects(
      save(randomUUID(), null, "save", payload, uuid(2)),
      /Guardian enrollment access required/,
    );
    await assert.rejects(review(first, randomUUID(), "approved"), /reviewer access required/);
    const other = await save(randomUUID(), null, "submit", {
      ...payload,
      fullName: "TEST OTHER FAMILY",
    });
    await actor(13);
    assert.equal((await rows("select * from student_transportation_students")).length, 3);
    await assert.rejects(review(first, randomUUID(), "rejected"), /rejection notes required/);
    const reviewRequest = randomUUID();
    await review(first, reviewRequest, "rejected", "TEST correction required");
    await review(first, reviewRequest, "rejected", "TEST correction required");
    await assert.rejects(review(first, reviewRequest, "approved"), /already used/);
    await review(other, randomUUID(), "approved");
    await actor(11);
    assert.equal(
      (await rows("select * from student_transportation_students where student_id=$1", [first]))[0]
        .review_notes,
      "TEST correction required",
    );
    await save(randomUUID(), first, "submit");
    await actor(13);
    await review(first, randomUUID(), "approved");
    await grant(11, "reviewer");
    await actor(11);
    await assert.rejects(review(second, randomUUID(), "approved"), /another guardian/);
    await save(randomUUID(), first, "withdraw");
    await actor(13);
    await grant(11, "reviewer", false);
    await grant(11, "guardian", false);
    await actor(11);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    await assert.rejects(
      save(randomUUID(), second, "withdraw"),
      /Guardian enrollment access required/,
    );
    await actor(13);
    await configure(false);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    await configure(true);
    await db.exec("reset role");
    await db.exec(
      "update tenants set status='suspended' where tenant_id='00000000-0000-0000-0000-000000000001'",
    );
    await actor(12);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    await db.exec("reset role; update tenants set status='active'");
    await db.exec(
      "update auth.users set email_confirmed_at=null where id='00000000-0000-0000-0000-000000000012'",
    );
    await actor(12);
    await assert.rejects(save(randomUUID()), /Guardian enrollment access required/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.exec("select my_student_enrollment_context()"), /permission denied/);
    await assert.rejects(
      db.exec("select * from student_transportation_students"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(
      "update auth.users set email_confirmed_at=null where id='00000000-0000-0000-0000-000000000013'",
    );
    await actor(13);
    await assert.rejects(configure(false), /governance membership required/);
    await assert.rejects(grant(11, "guardian"), /governance membership required/);
    await db.exec("reset role");
    // Verified organization owner, with no platform role or implicit reviewer access.
    await db.exec(
      "insert into tenant_role_assignments select tenant_id,membership_id,'tenant_owner','active',null from tenant_memberships where person_id='00000000-0000-0000-0000-000000000014'",
    );
    await actor(14);
    const ownContext = (await rows("select my_student_enrollment_context() as value"))[0].value;
    assert.equal(ownContext.programs[0].canConfigure, true);
    assert.equal(ownContext.programs[0].canReview, false);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    assert.equal((await rows("select * from student_transportation_contacts")).length, 0);
    await configure(false);
    await configure(true);
    await assert.rejects(
      rows("select configure_student_enrollment_program($1,true,'pilot_setup')", [uuid(2)]),
      /governance membership required/,
    );
    await assert.rejects(
      rows("select set_student_enrollment_access($1,$2,'reviewer',true,'reviewer_assignment')", [
        uuid(2),
        "student-test-14@example.invalid",
      ]),
      /governance membership required/,
    );
    await grant(14, "reviewer");
    assert.equal((await rows("select * from student_transportation_students")).length, 3);
    await grant(14, "reviewer", false);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    await db.exec("reset role; update tenant_role_assignments set role_key='tenant_admin'");
    await actor(14);
    await assert.rejects(configure(true), /governance membership required/);
    await db.exec(
      "reset role; update tenant_role_assignments set role_key='tenant_owner', expires_at=now()-interval '1 minute'",
    );
    await actor(14);
    await assert.rejects(configure(true), /governance membership required/);
    await db.exec(
      "reset role; update tenant_role_assignments set expires_at=null; update tenant_memberships set status='suspended' where person_id='00000000-0000-0000-0000-000000000014'",
    );
    await actor(14);
    await assert.rejects(configure(true), /governance membership required/);
    await db.exec(
      "reset role; update tenant_memberships set status='active'; update auth.users set email_confirmed_at=null where id='00000000-0000-0000-0000-000000000014'",
    );
    await actor(14);
    await assert.rejects(configure(true), /governance membership required/);
    await db.exec("reset role");
    assert.equal(
      (
        await rows(
          "select * from platform_role_assignments where person_id='00000000-0000-0000-0000-000000000014'",
        )
      ).length,
      0,
    );
    const audit = await rows("select * from tenant_audit_events");
    assert.ok(audit.length > 10);
    assert.ok(!JSON.stringify(audit).includes("TEST CHILD"));
    assert.ok(!JSON.stringify(audit).includes("2025550101"));
    assert.equal(
      (
        await rows(
          "select count(*)::int as n from tenant_product_entitlements where workspace_key='student_transportation'",
        )
      )[0].n,
      0,
    );
    assert.equal(
      (
        await rows(
          "select status from tenant_product_workspaces where workspace_key='student_transportation' limit 1",
        )
      )[0].status,
      "disabled",
    );
    console.log(
      "PASS organization-owner governance without platform elevation, cross-tenant denial, explicit reviewer admission, expired/suspended/unverified owner denial, guardian privacy, lifecycle, retries, audit and disabled rides. Actual existing identity/role helpers; minimal legacy schema.",
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
