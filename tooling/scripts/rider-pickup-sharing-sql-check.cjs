// Isolated minimal PostgreSQL smoke check. No environment or remote access.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../tmp/native-push-sql/node_modules/@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    for (const file of ['tooling/sql/rider-active-booking-bootstrap.sql', 'tooling/sql/rider-pickup-sharing-bootstrap.sql',
      'supabase/migrations/20261008000100_rider_pickup_location_sharing.sql', 'tooling/sql/rider-pickup-sharing-test.sql'])
      await db.exec(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'));
    console.log('Pickup sharing privacy smoke check passed (minimal schema; no full Supabase/concurrency certification).');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
