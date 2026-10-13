// Disposable local PostgreSQL only. No remote database or environment access.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../tmp/native-push-sql/node_modules/@electric-sql/pglite');
const read = (file) => fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
async function main() {
  const db = new PGlite();
  try {
    for (const file of ['tooling/sql/native-push-bootstrap.sql', 'tooling/sql/rating-appeals-bootstrap.sql',
      'tooling/sql/assigned-driver-rating-bootstrap.sql', 'supabase/migrations/20260810000200_trip_reputation.sql'])
      await db.exec(read(file));
    // Load the actual production portal definition/grants with minimal legacy dependencies.
    const source = read('supabase/migrations/20260801000900_verified_rider_booking.sql');
    const start = source.indexOf('create or replace function public.my_rider_portal(');
    const end = 'grant execute on function public.my_rider_portal(text) to authenticated;';
    if (start < 0 || source.indexOf(end, start) < 0) throw new Error('Actual portal definition missing');
    await db.exec(source.slice(start, source.indexOf(end, start) + end.length));
    for (const file of ['supabase/migrations/20261013000300_assigned_driver_rating.sql', 'tooling/sql/assigned-driver-rating-test.sql'])
      await db.exec(read(file));
    console.log('Assigned Driver rating: actual portal projection, average/count, disclosure, moderation, tenant/owner isolation and lifecycle passed (minimal schema).');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
