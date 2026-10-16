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
        ? role === "school_admin"
          ? "school_administrator_assignment"
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
    await actor(13);
    await grant(11, "guardian");
    await configure(true);
    await db.exec("reset role");
    await db.exec(read("supabase/migrations/20261015000200_school_managed_enrollment.sql"));
    await actor(13);
    await configure(false);
    await assert.rejects(grant(12, "guardian"), /Invalid access request/);
    await actor(11);
    assert.equal(
      (await rows("select has_student_enrollment_access($1,'guardian') as ok", [uuid(1)]))[0].ok,
      false,
    );
    await assert.rejects(save(randomUUID()), /School administrator enrollment access required/);
    await assert.rejects(configure(true), /governance membership required/);
    await actor(13);
    await grant(11, "school_admin");
    await grant(12, "school_admin");
    await actor(11);
    await assert.rejects(save(randomUUID()), /School administrator enrollment access required/);
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
      /school enrollment authority/,
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
      /School administrator enrollment access required/,
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
    await assert.rejects(review(second, randomUUID(), "approved"), /another submitter/);
    await save(randomUUID(), first, "withdraw");
    await actor(13);
    await grant(11, "reviewer", false);
    await grant(11, "school_admin", false);
    await actor(11);
    assert.equal((await rows("select * from student_transportation_students")).length, 0);
    await assert.rejects(
      save(randomUUID(), second, "withdraw"),
      /School administrator enrollment access required/,
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
    await assert.rejects(save(randomUUID()), /School administrator enrollment access required/);
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
    await assert.rejects(grant(11, "school_admin"), /governance membership required/);
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
    // New customer requests use account admission without granting tenant/staff membership.
    await db.exec(read("supabase/migrations/20261015000300_student_customer_requests.sql"));
    await db.exec(
      "update auth.users set email_confirmed_at=now(); insert into auth.users values('00000000-0000-0000-0000-000000000021',now()),('00000000-0000-0000-0000-000000000022',now()); insert into person_profiles select id,id,'student-test-'||right(id::text,2)||'@example.invalid','active' from auth.users where id in ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000022')",
    );
    await actor(14);
    const createKey = randomUUID();
    const create = async (key, email = "student-test-21@example.invalid") =>
      (
        await rows("select create_student_customer($1,$2,'TEST CUSTOMER','school',$3) as id", [
          uuid(1),
          key,
          email,
        ])
      )[0].id;
    const customer = await create(createKey);
    assert.equal(await create(createKey), customer);
    await assert.rejects(create(createKey, "student-test-22@example.invalid"), /already used/);
    const secondCustomer = await create(randomUUID(), "student-test-22@example.invalid");
    const setStatus = (active) =>
      rows("select set_student_customer_status($1,$2,$3)", [uuid(1), customer, active]);
    await actor(21);
    assert.equal(
      (await rows("select my_student_enrollment_context() as c"))[0].c.programs.length,
      0,
    );
    assert.equal(
      (await rows("select my_student_customer_context() as c"))[0].c.customers.length,
      1,
    );
    await assert.rejects(create(randomUUID()), /Internal customer management/);
    await assert.rejects(configure(true), /governance membership/);
    await assert.rejects(save(randomUUID()), /School administrator enrollment/);
    await assert.rejects(setStatus(false), /Internal customer management/);
    const studentList = [
      { name: "TEST STUDENT A", pickupAddress: "TEST PICKUP A" },
      { name: "TEST STUDENT B", pickupAddress: "TEST PICKUP B" },
      { name: "TEST STUDENT C", pickupAddress: "TEST PICKUP C" },
    ];
    const when = new Date(Date.now() + 3600000).toISOString();
    const submit = async (
      key,
      list = studentList,
      account = customer,
      time = when,
      tenant = uuid(1),
    ) =>
      (
        await rows("select submit_student_transport_request($1,$2,$3,$4,$5,$6) as id", [
          tenant,
          account,
          key,
          time,
          "TEST SCHOOL DESTINATION",
          list,
        ])
      )[0].id;
    const requestKey = randomUUID();
    const transportRequest = await submit(requestKey);
    assert.equal(await submit(requestKey), transportRequest);
    assert.equal((await rows("select * from student_transportation_requests")).length, 1);
    assert.equal(
      (await rows("select * from student_transportation_requests"))[0].students.length,
      3,
    );
    await assert.rejects(submit(requestKey, studentList.slice(0, 1)), /already used/);
    await assert.rejects(submit(randomUUID(), []), /one and twenty/);
    await assert.rejects(
      submit(randomUUID(), [{ name: 42, pickupAddress: "TEST ADDRESS" }]),
      /name and pickup/,
    );
    await assert.rejects(
      submit(randomUUID(), [{ ...studentList[0], secret: "not allowed" }]),
      /name and pickup/,
    );
    await assert.rejects(submit(randomUUID(), studentList, customer, "2000-01-01"), /Valid future/);
    await assert.rejects(
      submit(randomUUID(), studentList, customer, when, uuid(2)),
      /Customer access/,
    );
    await assert.rejects(submit(randomUUID(), studentList, secondCustomer), /Customer access/);
    await assert.rejects(
      db.exec("update student_transportation_requests set status='withdrawn'"),
      /permission denied/,
    );
    await actor(22);
    assert.equal((await rows("select * from student_transportation_requests")).length, 0);
    await assert.rejects(
      rows("select withdraw_student_transport_request($1,$2)", [uuid(1), transportRequest]),
      /Customer access/,
    );
    await actor(14);
    await setStatus(false);
    await actor(21);
    assert.equal((await rows("select * from student_transportation_requests")).length, 0);
    await assert.rejects(submit(randomUUID()), /Customer access/);
    await actor(14);
    await setStatus(true);
    await configure(false);
    await actor(21);
    assert.equal((await rows("select * from student_transportation_requests")).length, 0);
    await assert.rejects(submit(randomUUID()), /Customer access/);
    await actor(14);
    await configure(true);
    await db.exec(
      "reset role; update auth.users set email_confirmed_at=null where id='00000000-0000-0000-0000-000000000021'",
    );
    await actor(21);
    await assert.rejects(submit(randomUUID()), /Customer access/);
    await db.exec(
      "reset role; update auth.users set email_confirmed_at=now() where id='00000000-0000-0000-0000-000000000021'",
    );
    await actor(21);
    await rows("select withdraw_student_transport_request($1,$2)", [uuid(1), transportRequest]);
    await rows("select withdraw_student_transport_request($1,$2)", [uuid(1), transportRequest]);
    assert.equal(
      (await rows("select status from student_transportation_requests"))[0].status,
      "withdrawn",
    );
    await actor(12); // explicitly admitted internal enrollment staff
    assert.equal((await rows("select * from student_transportation_requests")).length, 1);
    await db.exec("reset role");
    assert.equal(
      (await rows("select * from tenant_memberships where person_id=$1", [uuid(21)])).length,
      0,
    );
    const customerAudit = JSON.stringify(
      await rows(
        "select metadata,reason from tenant_audit_events where event_name like 'student_request.%'",
      ),
    );
    assert.ok(!customerAudit.includes("TEST STUDENT"));
    assert.ok(!customerAudit.includes("TEST PICKUP"));
    await db.exec("set role anon");
    await assert.rejects(db.exec("select my_student_customer_context()"), /permission denied/);
    await db.exec("reset role");
    assert.ok(audit.length > 10);
    // Invitation signup uses real verified auth email, never existing tenant/staff membership.
    await db.exec(
      "alter table auth.users add column email text; update auth.users u set email=p.normalized_email from person_profiles p where p.auth_user_id=u.id; alter table person_profiles alter column person_id set default gen_random_uuid(); alter table person_profiles add column display_name text; alter table person_profiles add column primary_email text; alter table person_profiles add column activated_at timestamptz",
    );
    await db.exec(read("supabase/migrations/20261015000400_student_customer_invitations.sql"));
    await actor(14);
    const invitationKey = randomUUID();
    const invite = async (key = invitationKey) =>
      (
        await rows(
          "select prepare_student_customer_invitation($1,$2,'TEST NEW SCHOOL','school','NEW-SCHOOL@example.invalid') as value",
          [uuid(1), key],
        )
      )[0].value;
    const pending = await invite();
    assert.equal(pending.sendAllowed, true);
    assert.equal((await invite()).sendAllowed, false);
    assert.equal((await invite()).customerId, pending.customerId);
    await db.exec("reset role");
    assert.equal(
      (
        await rows(
          "select * from person_profiles where normalized_email='new-school@example.invalid'",
        )
      ).length,
      0,
    );
    assert.equal(
      (
        await rows("select * from student_transportation_customer_users where customer_id=$1", [
          pending.customerId,
        ])
      ).length,
      0,
    );
    await actor(22);
    await assert.rejects(invite(randomUUID()), /Internal customer management/);
    assert.equal((await rows("select accept_my_student_customer_invitations() as n"))[0].n, 0);
    assert.equal(
      (await rows("select * from student_transportation_customer_invitations")).length,
      0,
    );
    await db.exec(
      "reset role; insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-0000-0000-000000000023','new-school@example.invalid',null)",
    );
    await actor(23);
    await assert.rejects(rows("select accept_my_student_customer_invitations()"), /Verified email/);
    await db.exec(
      "reset role; update auth.users set email_confirmed_at=now() where id='00000000-0000-0000-0000-000000000023'; update student_transportation_customer_invitations set expires_at=now()-interval '1 minute' where customer_id='" +
        pending.customerId +
        "'",
    );
    await actor(23);
    assert.equal((await rows("select accept_my_student_customer_invitations() as n"))[0].n, 0);
    await actor(14);
    const resend = () =>
      rows("select prepare_student_customer_resend($1,$2) as value", [uuid(1), pending.customerId]);
    assert.equal((await resend())[0].value.sendAllowed, false);
    await db.exec("reset role");
    await db.query(
      "update student_transportation_customer_invitations set last_email_attempt_at=now()-interval '2 minutes' where customer_id=$1",
      [pending.customerId],
    );
    await actor(14);
    assert.equal((await resend())[0].value.sendAllowed, true);
    await rows("select set_student_customer_status($1,$2,false)", [uuid(1), pending.customerId]);
    await actor(23);
    assert.equal((await rows("select accept_my_student_customer_invitations() as n"))[0].n, 0);
    await actor(14);
    await rows("select set_student_customer_status($1,$2,true)", [uuid(1), pending.customerId]);
    await actor(23);
    assert.equal((await rows("select accept_my_student_customer_invitations() as n"))[0].n, 1);
    assert.equal((await rows("select accept_my_student_customer_invitations() as n"))[0].n, 0);
    assert.equal(
      (await rows("select my_student_customer_context() as c"))[0].c.customers[0].customerId,
      pending.customerId,
    );
    assert.equal(
      (await rows("select my_student_enrollment_context() as c"))[0].c.programs.length,
      0,
    );
    await assert.rejects(configure(true), /governance membership/);
    await assert.rejects(save(randomUUID()), /School administrator enrollment/);
    await db.exec("reset role");
    const newPerson = (
      await rows("select person_id from person_profiles where auth_user_id=$1", [uuid(23)])
    )[0].person_id;
    assert.equal(
      (await rows("select * from tenant_memberships where person_id=$1", [newPerson])).length,
      0,
    );
    assert.equal(
      (await rows("select * from platform_role_assignments where person_id=$1", [newPerson]))
        .length,
      0,
    );
    assert.equal(
      (
        await rows("select * from student_transportation_enrollment_access where person_id=$1", [
          newPerson,
        ])
      ).length,
      0,
    );
    const inviteAudit = JSON.stringify(
      await rows(
        "select metadata,reason from tenant_audit_events where event_name like 'student_customer.invitation%'",
      ),
    );
    assert.ok(!inviteAudit.includes("new-school@example.invalid"));
    await actor(14);
    const restricted = (
      await rows(
        "select prepare_student_customer_invitation($1,$2,'TEST RESTRICTED SCHOOL','school','student-test-22@example.invalid') as value",
        [uuid(1), randomUUID()],
      )
    )[0].value;
    await db.exec(
      "reset role; update person_profiles set status='suspended' where person_id='00000000-0000-0000-0000-000000000022'",
    );
    await actor(22);
    await assert.rejects(
      rows("select accept_my_student_customer_invitations()"),
      /Active matching identity/,
    );
    await db.exec(
      "reset role; update person_profiles set status='active',auth_user_id='00000000-0000-0000-0000-000000000021' where person_id='00000000-0000-0000-0000-000000000022'",
    );
    await actor(22);
    await assert.rejects(
      rows("select accept_my_student_customer_invitations()"),
      /Active matching identity/,
    );
    await db.exec("reset role");
    assert.equal(
      (
        await rows("select * from student_transportation_customer_users where customer_id=$1", [
          restricted.customerId,
        ])
      ).length,
      0,
    );
    await db.exec("set role anon");
    await assert.rejects(
      rows("select accept_my_student_customer_invitations()"),
      /permission denied/,
    );
    await assert.rejects(
      rows("select * from student_transportation_customer_invitations"),
      /permission denied/,
    );
    await db.exec("reset role");
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
      "PASS governance/enrollment regressions; customer without tenant/staff membership; account/tenant isolation; three-student grouped request; malformed/past request denial; retries; pause/unverified denial; withdrawal; private audit and disabled rides. Actual identity/role helpers and new migrations, minimal legacy schema.",
    );
  } finally {
    await db.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
