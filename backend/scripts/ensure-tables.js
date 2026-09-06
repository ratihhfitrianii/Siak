// Ensure required tables exist without node-pg-migrate (avoids migration order conflicts).
// Production DB already has most tables; this only creates missing ones with IF NOT EXISTS.
const { Pool } = require('pg');

async function main() {
  // Dukungan dua bentuk koneksi: DATABASE_URL (env.production — dipakai app utama)
  // ATAU PGHOST/PGPORT/... terpisah (dev). Kalau keduanya ada, DATABASE_URL menang.
  const pool = new Pool(
    process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
      : {
          host: process.env.PGHOST || 'localhost',
          port: Number(process.env.PGPORT || 5432),
          database: process.env.PGDATABASE || 'siak',
          user: process.env.PGUSER || 'siak',
          password: process.env.PGPASSWORD || 'siak_dev_password',
        },
  );

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

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id          SMALLSERIAL PRIMARY KEY,
        code        VARCHAR(20) NOT NULL UNIQUE,
        name        VARCHAR(100) NOT NULL,
        capacity    INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
        faculty_code VARCHAR(10) NOT NULL,
        is_active   BOOLEAN NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    console.log('✅ rooms table ensured');

    // Kolom admin_faculty_code — coba dengan FK ke faculties(code); jika FK gagal
    // (mis. constraints legacy), tetap buat kolom polos agar query auth tidak rusak.
    try {
      await pool.query(
        `ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_faculty_code VARCHAR(10) REFERENCES faculties(code);`,
      );
    } catch (fkErr) {
      console.warn('⚠️ ADD COLUMN w/ FK gagal, fallback ke kolom tanpa FK:', fkErr.message);
      try {
        await pool.query(
          `ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_faculty_code VARCHAR(10);`,
        );
      } catch (e) {
        console.error('❌ Gagal menambah admin_faculty_code:', e.message);
      }
    }
    console.log('✅ users.admin_faculty_code ensured');

    // Kolom kaprodi/wakil kaprodi (migrasi 20260905010000) — wajib ada karena
    // auth-middleware SELECT u.is_kaprodi, u.is_wakil_kaprodi di SETIAP request.
    // Kalau kolom tidak ada → query auth error → 401 "Token tidak valid atau kadaluarsa".
    await pool.query(
      `ALTER TABLE users
         ADD COLUMN IF NOT EXISTS is_kaprodi BOOLEAN NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS is_wakil_kaprodi BOOLEAN NOT NULL DEFAULT false;`,
    );
    console.log('✅ users.is_kaprodi / is_wakil_kaprodi ensured');

    // Tabel pengajuan jadwal kaprodi (migrasi 20260905010000)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_submissions (
        id            BIGSERIAL PRIMARY KEY,
        lecturer_id   BIGINT NOT NULL REFERENCES lecturers(id) ON DELETE CASCADE,
        semester_id   SMALLINT NOT NULL REFERENCES semesters(id),
        status        VARCHAR(20) NOT NULL DEFAULT 'awaiting', -- awaiting | approved | rejected
        submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        reviewed_by   BIGINT REFERENCES users(id),
        reviewed_at   TIMESTAMPTZ,
        review_note   VARCHAR(500),
        UNIQUE (lecturer_id, semester_id)
      );
    `);
    console.log('✅ schedule_submissions table ensured');

    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_schedule_submissions_lecturer ON schedule_submissions(lecturer_id);`,
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_schedule_submissions_semester ON schedule_submissions(semester_id);`,
    );
    console.log('✅ schedule_submissions indexes ensured');
  } catch (err) {
    // Best-effort: jangan blok start aplikasi kalau ensure gagal (mis. DB sementara down).
    // Log ke output agar terlihat di dashboard, tapi biarkan proses lanjut (exit 0).
    console.error(
      '❌ Error ensuring tables:',
      err && typeof err === 'object' && 'message' in err ? err.message : String(err),
    );
  } finally {
    await pool.end();
  }
}

main();
