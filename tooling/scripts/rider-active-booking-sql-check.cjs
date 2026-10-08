// In-memory minimal-schema smoke check. No environment or remote database access.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../tmp/native-push-sql/node_modules/@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    for (const file of ['tooling/sql/rider-active-booking-bootstrap.sql',
      'supabase/migrations/20261007000100_rider_active_booking_guard.sql', 'tooling/sql/rider-active-booking-test.sql'])
      await db.exec(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'));
    console.log('Active-booking migration smoke check passed (minimal schema, no concurrency certification).');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
