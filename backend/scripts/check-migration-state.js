require('dotenv/config');
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await c.connect();
  const t = await c.query(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('skripsi_guidance_logs','announcements','pgmigrations')",
  );
  console.log('TABLES:', t.rows.map((r) => r.table_name).join(', '));
  const m = await c.query('SELECT name, run_on FROM pgmigrations ORDER BY run_on DESC LIMIT 10');
  console.log('LAST_MIGRATIONS:');
  for (const r of m.rows) console.log(' -', r.name);
  await c.end();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
