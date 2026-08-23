/**
 * Rekam migrasi legacy yang strukturnya SUDAH ada di DB produksi (diterapkan manual
 * sebelum sistem migration bookkeeping berjalan) ke pgmigrations, supaya
 * `node-pg-migrate up` tidak lagi mencoba menerapkannya ulang.
 *
 * Idempotent — hanya mengisi nama yang belum tercatat. Timestamp dipilih sesuai
 * urutan nomor file agar checkOrder lolos.
 *
 * Usage: node scripts/record-applied-migrations.js
 */
require('dotenv/config');
const { Client } = require('pg');

// Semua migrasi yang TIDAK ADA di pgmigrations dan strukturnya sudah diverifikasi ada.
// Format: [nama_file_tanpa_.sql, timestamp_ISO_urut]
const APPLIED = [
  ['V20260801_001__create_core_tables', '2026-08-01T01:00:00Z'],
  ['V20260801_002__create_academic_tables', '2026-08-01T02:00:00Z'],
  ['V20260801_003__create_krs_grades_tables', '2026-08-01T03:00:00Z'],
  ['V20260801_004__seed_base_data', '2026-08-01T04:00:00Z'],
  ['V20260801_005__seed_development_data', '2026-08-01T05:00:00Z'],
  ['V20260801_006__seed_krs_dev', '2026-08-01T06:00:00Z'],
  ['V20260801_007__fix_seed_emails', '2026-08-01T07:00:00Z'],
  ['V20260801_008__seed_krs_all_prodi', '2026-08-01T08:00:00Z'],
  ['V20260801_009__fix_seed_passwords', '2026-08-01T09:00:00Z'],
  ['V20260801_010__reset_class_quota_dev', '2026-08-01T10:00:00Z'],
  ['V20260801_011__add_departemen_and_extend_curriculum', '2026-08-01T11:00:00Z'],
  ['V20260801_012__audit_logs_changed_by_set_null', '2026-08-01T12:00:00Z'],
  ['V20260801_013__users_must_change_password', '2026-08-01T13:00:00Z'],
  ['V20260804_014__add_payment_generation', '2026-08-04T14:00:00Z'],
  ['V20260805_015__notification_delivery', '2026-08-05T15:00:00Z'],
  ['V20260805_016__lecturer_course_selections', '2026-08-05T16:00:00Z'],
  ['V20260806_017__grades_remedial_per_component', '2026-08-06T17:00:00Z'],
  ['V20260815_018__create_announcements', '2026-08-15T10:00:00Z'],
  ['V20260817_019__add_student_profile_fields', '2026-08-17T03:00:00Z'],
  ['V20260817_020__add_payment_proof_url', '2026-08-17T11:00:00Z'],
  ['V20260819_001__add_domicile_address', '2026-08-19T10:00:00Z'],
  ['V20260820_001__create_skripsi_tables', '2026-08-20T10:00:00Z'],
  ['V20260820_002__add_multiple_supervisors', '2026-08-20T11:00:00Z'],
  ['V20260821_2224__add_attendance_recap_permission', '2026-08-21T22:24:00Z'],
  ['V20260822_001__seed_academic_year_2026_2027', '2026-08-22T01:00:00Z'],
];

const c = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await c.connect();
  let added = 0;
  for (const [name, ts] of APPLIED) {
    const ex = await c.query('SELECT 1 FROM pgmigrations WHERE name=$1', [name]);
    if (ex.rows.length === 0) {
      await c.query('INSERT INTO pgmigrations (name, run_on) VALUES ($1, $2)', [name, ts]);
      added++;
    }
  }
  console.log(`Recorded ${added} previously-applied migrations.`);
  const m = await c.query('SELECT count(*) FROM pgmigrations');
  console.log('Total in pgmigrations:', m.rows[0].count);
  await c.end();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
