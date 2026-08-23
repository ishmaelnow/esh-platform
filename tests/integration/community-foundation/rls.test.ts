import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const MIGRATION = "supabase/migrations/20260823000100_community_authorization_foundation.sql";
const runRls = process.env.RUN_SUPABASE_RLS_TESTS === "true" ? test : test.skip;

function psql(input: string): string {
  return execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-f", "-"], {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      PGHOST: process.env.SUPABASE_TEST_DB_HOST ?? "127.0.0.1",
      PGPORT: process.env.SUPABASE_TEST_DB_PORT ?? "54322",
      PGUSER: process.env.SUPABASE_TEST_DB_USER ?? "postgres",
      PGPASSWORD: process.env.SUPABASE_TEST_DB_PASSWORD ?? "postgres",
      PGDATABASE: process.env.SUPABASE_TEST_DB_NAME ?? "postgres",
    },
  });
}

describe("Community authorization foundation", () => {
  test("contains catalogs, disabled capabilities, RLS, and separate emergency authority", () => {
    const sql = readFileSync(resolve(ROOT, MIGRATION), "utf8");
    for (const capability of [
      "app.community",
      "community.content",
      "community.groups",
      "community.services",
      "community.moderation",
      "community.broadcasts",
    ]) {
      expect(sql).toContain(`'${capability}'`);
    }
    expect(sql).toContain("create table public.capability_catalog");
    expect(sql).toContain("create table public.community_permission_catalog");
    expect(sql).toContain("create table public.tenant_community_settings");
    expect(sql).toContain("create table public.tenant_community_role_assignments");
    expect(sql).toContain("create or replace function public.has_community_permission");
    expect(sql).toContain("create or replace function public.can_broadcast_community");
    expect(sql).toContain("community.broadcasts.urgent");
    expect(sql).toContain("('emergency_publisher', 'community.broadcasts.emergency')");
    expect(sql).not.toContain("('community_admin', 'community.broadcasts.emergency')");
    expect(sql).toContain("alter table public.tenant_community_settings enable row level security");
  });

  runRls("enforces tenant, membership, moderator, admin, and emergency boundaries", () => {
    const sql = `
begin;
create or replace function pg_temp.ok(label text, actual boolean, expected boolean)
returns void language plpgsql as $$ begin
  if actual is distinct from expected then raise exception '% expected %, got %', label, expected, actual; end if;
end $$;

insert into auth.users (id, aud, role, email, email_confirmed_at, created_at, updated_at) values
 ('81000000-0000-4000-8000-000000000001','authenticated','authenticated','ca-owner@example.test',now(),now(),now()),
 ('81000000-0000-4000-8000-000000000002','authenticated','authenticated','ca-member@example.test',now(),now(),now()),
 ('81000000-0000-4000-8000-000000000003','authenticated','authenticated','ca-moderator@example.test',now(),now(),now()),
 ('81000000-0000-4000-8000-000000000004','authenticated','authenticated','ca-emergency@example.test',now(),now(),now()),
 ('81000000-0000-4000-8000-000000000005','authenticated','authenticated','cb-owner@example.test',now(),now(),now()),
 ('81000000-0000-4000-8000-000000000006','authenticated','authenticated','ca-suspended@example.test',now(),now(),now());
insert into public.person_profiles
 (person_id,auth_user_id,status,display_name,primary_email,normalized_email,activated_at) values
 ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','active','A Owner','ca-owner@example.test','ca-owner@example.test',now()),
 ('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000002','active','A Member','ca-member@example.test','ca-member@example.test',now()),
 ('82000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000003','active','A Moderator','ca-moderator@example.test','ca-moderator@example.test',now()),
 ('82000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000004','active','A Emergency','ca-emergency@example.test','ca-emergency@example.test',now()),
 ('82000000-0000-4000-8000-000000000005','81000000-0000-4000-8000-000000000005','active','B Owner','cb-owner@example.test','cb-owner@example.test',now()),
 ('82000000-0000-4000-8000-000000000006','81000000-0000-4000-8000-000000000006','active','A Suspended','ca-suspended@example.test','ca-suspended@example.test',now());
insert into public.tenants (tenant_id,status) values
 ('83000000-0000-4000-8000-000000000001','provisioning'),
 ('83000000-0000-4000-8000-000000000002','provisioning');
insert into public.tenant_configurations
 (tenant_id,legal_name,display_name,default_time_zone,support_contact_email) values
 ('83000000-0000-4000-8000-000000000001','A Legal','A','America/Chicago','a@example.test'),
 ('83000000-0000-4000-8000-000000000002','B Legal','B','America/Chicago','b@example.test');
insert into public.tenant_memberships
 (membership_id,tenant_id,person_id,status,activated_at,suspended_at) values
 ('84000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','active',now(),null),
 ('84000000-0000-4000-8000-000000000002','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000002','active',now(),null),
 ('84000000-0000-4000-8000-000000000003','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003','active',now(),null),
 ('84000000-0000-4000-8000-000000000004','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000004','active',now(),null),
 ('84000000-0000-4000-8000-000000000005','83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000005','active',now(),null),
 ('84000000-0000-4000-8000-000000000006','83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000006','suspended',null,now());
insert into public.tenant_role_assignments (tenant_id,membership_id,role_key,status,assigned_at) values
 ('83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','tenant_owner','active',now()),
 ('83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000002','tenant_member','active',now()),
 ('83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','tenant_member','active',now()),
 ('83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000004','tenant_member','active',now()),
 ('83000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000005','tenant_owner','active',now()),
 ('83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000006','tenant_member','active',now());
update public.tenants set status='active',activated_at=now();
select pg_temp.ok('disabled default',public.tenant_capability_enabled('83000000-0000-4000-8000-000000000001','app.community'),false);
update public.tenant_capabilities set enabled=true,enabled_at=now(),disabled_at=null
 where tenant_id='83000000-0000-4000-8000-000000000001'
   and (capability_key like 'community.%' or capability_key='app.community');
insert into public.tenant_community_role_assignments
 (tenant_id,membership_id,role_key,assigned_by_person_id,reason) values
 ('83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000003','community_moderator','82000000-0000-4000-8000-000000000001','test'),
 ('83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000004','emergency_publisher','82000000-0000-4000-8000-000000000001','test');
update public.tenant_community_settings set important_broadcast_enabled=true,
 urgent_broadcast_enabled=true,emergency_broadcast_enabled=true
 where tenant_id='83000000-0000-4000-8000-000000000001';

set local role authenticated; set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000002';
select pg_temp.ok('member create',public.can_create_community_content('83000000-0000-4000-8000-000000000001'),true);
select pg_temp.ok('member moderate',public.can_moderate_community('83000000-0000-4000-8000-000000000001'),false);
select pg_temp.ok('cross tenant',public.can_create_community_content('83000000-0000-4000-8000-000000000002'),false); reset role;
set local role authenticated; set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000001';
select pg_temp.ok('owner moderate',public.can_moderate_community('83000000-0000-4000-8000-000000000001'),true);
select pg_temp.ok('owner emergency',public.can_broadcast_community('83000000-0000-4000-8000-000000000001','emergency'),false); reset role;
set local role authenticated; set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000003';
select pg_temp.ok('moderator moderate',public.can_moderate_community('83000000-0000-4000-8000-000000000001'),true);
select pg_temp.ok('moderator emergency',public.can_broadcast_community('83000000-0000-4000-8000-000000000001','emergency'),false); reset role;
set local role authenticated; set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000004';
select pg_temp.ok('emergency publish',public.can_broadcast_community('83000000-0000-4000-8000-000000000001','emergency'),true);
select pg_temp.ok('emergency moderate',public.can_moderate_community('83000000-0000-4000-8000-000000000001'),false); reset role;
set local role authenticated; set local request.jwt.claim.sub='81000000-0000-4000-8000-000000000006';
select pg_temp.ok('suspended create',public.can_create_community_content('83000000-0000-4000-8000-000000000001'),false); reset role;
rollback;`;
    expect(() => psql(sql)).not.toThrow();
  });
});
