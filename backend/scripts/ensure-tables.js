// Ensure required tables exist without node-pg-migrate (avoids migration order conflicts).
// Production DB already has most tables; this only creates missing ones with IF NOT EXISTS.
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'siak',
    user: process.env.PGUSER || 'siak',
    password: process.env.PGPASSWORD || 'siak_dev_password',
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skripsi_guidance_logs (
        id          BIGSERIAL PRIMARY KEY,
        proposal_id BIGINT NOT NULL REFERENCES skripsi_proposals(id) ON DELETE CASCADE,
        lecturer_id BIGINT NOT NULL REFERENCES users(id),
        session_date DATE NOT NULL,
        notes       TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log('✅ skripsi_guidance_logs table ensured');
  } catch (err) {
    console.error('❌ Error ensuring tables:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
