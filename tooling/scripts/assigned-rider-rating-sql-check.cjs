// Disposable PostgreSQL only. Never connects to production.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../tmp/native-push-sql/node_modules/@electric-sql/pglite');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
async function main() {
  const db = new PGlite();
  try {
    for (const file of ['tooling/sql/native-push-bootstrap.sql', 'tooling/sql/rating-appeals-bootstrap.sql',
      'tooling/sql/assigned-driver-rating-bootstrap.sql', 'tooling/sql/assigned-rider-rating-bootstrap.sql',
      'supabase/migrations/20260810000200_trip_reputation.sql']) await db.exec(read(file));
    const source = read('supabase/migrations/20260811000300_trip_pricing_v1.sql');
    const start = source.indexOf('create or replace function public.my_driver_dispatch()');
    const end = source.indexOf('\n$$;', start);
    if (start < 0 || end < 0) throw new Error('Actual Driver dispatch definition missing');
    await db.exec(source.slice(start, end + 4));
    await db.exec('revoke all on function public.my_driver_dispatch() from public,anon; grant execute on function public.my_driver_dispatch() to authenticated;');
    for (const file of ['supabase/migrations/20261013000400_assigned_rider_rating.sql', 'tooling/sql/assigned-rider-rating-test.sql']) await db.exec(read(file));
    console.log('Assigned Rider rating: actual dispatch, aggregate/disclosure/moderation, offers, tenant/owner isolation, reassignment and lifecycle passed (minimal schema).');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
