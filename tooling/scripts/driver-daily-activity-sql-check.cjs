// Disposable PostgreSQL smoke; deliberately no production connection or credentials.
const fs = require("node:fs");
const path = require("node:path");
const { PGlite } = require("../../tmp/native-push-sql/node_modules/@electric-sql/pglite");
async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table driver_profiles(driver_profile_id uuid primary key,tenant_id uuid);
      create table tenant_configurations(tenant_id uuid,default_time_zone text);
      create table driver_availability(driver_profile_id uuid,tenant_id uuid,requested_status text);
      create table dispatch_bookings(booking_id uuid,tenant_id uuid,current_driver_profile_id uuid,status text,
        completed_at timestamptz,actual_route_distance_meters integer,route_metrics_source text);
      create table tenant_audit_events(audit_event_id uuid default gen_random_uuid(),tenant_id uuid,resource_id text,
        resource_type text,event_name text,occurred_at timestamptz,created_at timestamptz default now(),metadata jsonb);
      create function require_preorder_driver() returns uuid language plpgsql as $$ begin
        if current_setting('test.driver',true) is null then raise exception 'Active Driver access is required'; end if;
        return current_setting('test.driver')::uuid;
      end; $$;
    `);
    for (const file of ["supabase/migrations/20261011000100_driver_daily_activity.sql", "tooling/sql/driver-daily-activity-test.sql"])
      await db.exec(fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8"));
    console.log("Driver daily ownership, overnight intervals, incomplete distance, zero day and DST smoke passed (minimal schema).");
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
