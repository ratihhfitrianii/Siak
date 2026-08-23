/**
 * Cek skema produksi (Neon) vs file migrasi lokal — identifikasi migrasi mana yang
 * strukturnya SUDAH ada di DB (diterapkan manual) tapi belum tercatat di pgmigrations.
 * Usage: node scripts/check-migration-gap.js
 */
require('dotenv/config');
const { Client } = require('pg');

const c = new Client({ connectionString: process.env.DATABASE_URL });

// Objek khas per migrasi: (nama file, query deteksi)
const PROBES = [
  [
    'V20260815_018__create_announcements',
    "SELECT 1 FROM information_schema.tables WHERE table_name='announcements'",
  ],
  [
    'V20260817_019__add_student_profile_fields',
    "SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='photo_url'",
  ],
  [
    'V20260817_020__add_payment_proof_url',
    "SELECT 1 FROM information_schema.columns WHERE table_name='payments' AND column_name='proof_url'",
  ],
  [
    'V20260819_001__add_domicile_address',
    "SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='domicile_address'",
  ],
  [
    'V20260820_001__create_skripsi_tables',
    "SELECT 1 FROM information_schema.tables WHERE table_name='skripsi_proposals'",
  ],
  [
    'V20260820_002__add_multiple_supervisors',
    "SELECT 1 FROM information_schema.tables WHERE table_name='skripsi_proposal_supervisors'",
  ],
  [
    'V20260821_2224__add_attendance_recap_permission',
    "SELECT 1 FROM permissions WHERE code='attendance.recap'",
  ],
  [
    'V20260822_001__seed_academic_year_2026_2027',
    "SELECT 1 FROM academic_years WHERE code='2026/2027'",
  ],
  [
    'V20260822_002__seed_courses_2026_2027',
    "SELECT 1 FROM classes cl JOIN curricula cur ON cur.id=cl.curriculum_id JOIN academic_years ay ON ay.id=cur.academic_year_id WHERE ay.code='2026/2027' LIMIT 1",
  ],
  [
    'V20260822_003__create_skripsi_guidance_logs',
    "SELECT 1 FROM information_schema.tables WHERE table_name='skripsi_guidance_logs'",
  ],
];

(async () => {
  await c.connect();
  for (const [name, probe] of PROBES) {
    try {
      const r = await c.query(probe);
      console.log(`${r.rows.length > 0 ? 'ADA ' : 'BELUM'} ${name}`);
    } catch (e) {
      console.log(`ERR  ${name}: ${e.message}`);
    }
  }
  // kolom students.photo_url alternatif penanda 019
  const alt = await c
    .query("SELECT column_name FROM information_schema.columns WHERE table_name='students'")
    .catch(() => null);
  if (alt) console.log('STUDENT_COLS:', alt.rows.map((r) => r.column_name).join(','));
  await c.end();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
