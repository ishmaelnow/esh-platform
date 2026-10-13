// Disposable local PostgreSQL only; never connects to production.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../tmp/native-push-sql/node_modules/@electric-sql/pglite');
async function main() {
  const db = new PGlite();
  try {
    for (const file of ['tooling/sql/native-push-bootstrap.sql', 'tooling/sql/trip-share-bootstrap.sql',
      'supabase/migrations/20261012000100_trip_share_links.sql', 'tooling/sql/trip-share-test.sql']) {
      await db.exec(fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8'));
    }
    console.log('Trip sharing ownership, RLS, projection, freshness, consent, expiry, replacement and lifecycle checks passed (minimal schema).');
  } finally { await db.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
