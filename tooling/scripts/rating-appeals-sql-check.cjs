// Local disposable PostgreSQL only. Never connects to production.
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('../../tmp/native-push-sql/node_modules/@electric-sql/pglite');
async function main() {
 const db = new PGlite();
 try {
  for (const file of ['tooling/sql/native-push-bootstrap.sql','tooling/sql/rating-appeals-bootstrap.sql',
    'supabase/migrations/20260810000200_trip_reputation.sql','supabase/migrations/20260815000500_trip_rating_appeals_v2.sql',
    'supabase/migrations/20261013000100_rating_appeal_review.sql','tooling/sql/rating-appeals-test.sql'])
    await db.exec(fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'));
  console.log('Rating appeals ownership, disclosure, role/tenant isolation, idempotence, decisions and audit checks passed (minimal schema).');
 } finally { await db.close(); }
}
main().catch((error)=>{ console.error(error.message); process.exitCode=1; });
