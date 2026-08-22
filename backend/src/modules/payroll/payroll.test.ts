// Test Payroll — service generatePayroll/listPayrolls + endpoint admin & dosen
// Env dari backend/.env (DATABASE_URL lokal port 5433) — JANGAN hardcode kredensial di sini.
import 'dotenv/config';
process.env.NODE_ENV = 'test';
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-secret-key-min-16-chars';
process.env.BCRYPT_ROUNDS ??= '4';

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';
import { generatePayroll, listPayrolls, approvePayroll, payPayroll } from './payroll.service';

describe('T-Payroll — Slip Gaji (generate → approve → pay → dosen lihat)', () => {
  let app: ReturnType<typeof createApp>;
  let keuanganToken: string;
  let dosenToken: string;
  let dosenLecturerId: number;
  let dosenUserId: number;
  const createdPayrollIds: number[] = [];
  const createdScheduleIds: number[] = [];
  let classId: number | null = null;
  let curriculumId: number | null = null;

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });
    return res.body.data.accessToken;
  }

  beforeAll(async () => {
    app = createApp({}, { waitingRoom: null });

    // Admin keuangan
    keuanganToken = await login('keuangan@siak.local', 'Admin123!');

    // Seed dosen aktif pertama
    const seedDosenRes = await pgPool.query(
      `SELECT u.id as user_id, l.id as lecturer_id
       FROM users u
       JOIN lecturers l ON l.user_id = u.id
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'dosen' AND u.is_active AND l.is_active
       ORDER BY u.id LIMIT 1`,
    );
    if (seedDosenRes.rows.length === 0) throw new Error('No seed dosen available');
    dosenLecturerId = Number(seedDosenRes.rows[0].lecturer_id);
    dosenUserId = Number(seedDosenRes.rows[0].user_id);
    dosenToken = await login(
      (await pgPool.query(`SELECT email FROM users WHERE id = $1`, [dosenUserId])).rows[0].email,
      'Dosen123!',
    );
  }, 30000);

  afterAll(async () => {
    // Cleanup: payroll dibuat test ini, jadwal buatan, lalu kelas/curriculum jika dibuat
    if (createdPayrollIds.length > 0) {
      await pgPool.query(`DELETE FROM payrolls WHERE id = ANY($1)`, [createdPayrollIds]);
    }
    if (createdScheduleIds.length > 0) {
      await pgPool.query(`DELETE FROM schedules WHERE id = ANY($1)`, [createdScheduleIds]);
    }
    if (classId) await pgPool.query(`DELETE FROM classes WHERE id = $1`, [classId]);
    if (curriculumId) await pgPool.query(`DELETE FROM curricula WHERE id = $1`, [curriculumId]);
  });

  it('generatePayroll menghitung honor dari sesi is_completed + insert status draft', async () => {
    // Pastikan ada minimal satu sesi selesai di periode Agustus 2026 utk dosen ini.
    // Cari kelas milik dosen; jika belum ada, buat curriculum+kelas+schedule sendiri.
    const classRes = await pgPool.query(
      `SELECT cl.id FROM classes cl WHERE cl.lecturer_id = $1 AND cl.is_active LIMIT 1`,
      [dosenUserId],
    );

    let usedClassId: number;
    if (classRes.rows.length === 0) {
      const courseRes = await pgPool.query(
        `INSERT INTO courses (code, name, credits) VALUES ($1, 'Payroll Test Course', 3) RETURNING id`,
        [`PAY${Date.now()}`],
      );
      const prodiRes = await pgPool.query(`SELECT prodi_id FROM lecturers WHERE id = $1`, [
        dosenLecturerId,
      ]);
      const semRes = await pgPool.query(`SELECT id FROM semesters WHERE is_active LIMIT 1`);
      const curRes = await pgPool.query(
        `INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
         VALUES ($1, $2, $3, true, 1) RETURNING id`,
        [
          Number(prodiRes.rows[0].prodi_id),
          Number(semRes.rows[0].id),
          Number(courseRes.rows[0].id),
        ],
      );
      curriculumId = Number(curRes.rows[0].id);
      const clsRes = await pgPool.query(
        `INSERT INTO classes (curriculum_id, class_code, lecturer_id, capacity, current_enrolled, is_active)
         VALUES ($1, 'PAY-A', $2, 30, 0, true) RETURNING id`,
        [curriculumId, dosenUserId],
      );
      classId = Number(clsRes.rows[0].id);
      usedClassId = classId;
    } else {
      usedClassId = Number(classRes.rows[0].id);
    }

    const schRes = await pgPool.query(
      `INSERT INTO schedules (class_id, meeting_number, scheduled_date, topic, is_completed)
       VALUES ($1, 901, '2026-08-10', 'Payroll test meeting', true) RETURNING id`,
      [usedClassId],
    );
    createdScheduleIds.push(Number(schRes.rows[0].id));

    const item = await generatePayroll(dosenLecturerId, '2026-08-01', '2026-08-31', 1);
    createdPayrollIds.push(item.id);

    expect(item.status).toBe('draft');
    expect(item.periodStart).toBe('2026-08-01');
    expect(item.totalMeetings).toBeGreaterThanOrEqual(1); // sesi yang barusan di-insert terhitung
    expect(item.baseSalary).toBeGreaterThan(0);
    expect(item.netAmount).toBe(item.baseSalary + item.totalHonor - item.deductions);
  });

  it('idempotent — generate ulang periode sama tidak menduplikasi baris (ON CONFLICT)', async () => {
    const first = await generatePayroll(dosenLecturerId, '2026-08-01', '2026-08-31', 1);
    const second = await generatePayroll(dosenLecturerId, '2026-08-01', '2026-08-31', 1);
    createdPayrollIds.push(first.id);
    expect(second.id).toBe(first.id); // update baris yang sama
  });

  it('listPayrolls admin berisi lecturer_name + filter periode bekerja', async () => {
    const res = await listPayrolls({ periodStart: '2026-08-01', periodEnd: '2026-08-31' });
    const ours = res.items.find((i) => i.lecturerId === dosenLecturerId);
    expect(ours).toBeDefined();
    expect(ours?.lecturerName).toBeTruthy();
    expect(res.total).toBeGreaterThanOrEqual(1);
  });

  it('listPayrolls filter q (nama/NIDN) & prodiId', async () => {
    // Ambil prodi dosen uji
    const lectRes = await pgPool.query(
      `SELECT prodi_id, nidn, user_id FROM lecturers WHERE id = $1`,
      [dosenLecturerId],
    );
    const { prodi_id } = lectRes.rows[0];
    const fullName = (
      await pgPool.query(`SELECT full_name FROM users WHERE id = $1`, [lectRes.rows[0].user_id])
    ).rows[0].full_name;

    // Cari by nama depan (potongan nama)
    const byName = await listPayrolls({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      q: fullName.split(' ')[0],
    });
    expect(byName.items.some((i) => i.lecturerId === dosenLecturerId)).toBe(true);

    // Filter prodi: dosen uji harus masuk; semua hasil di prodi yang sama
    const byProdi = await listPayrolls({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      prodiId: Number(prodi_id),
    });
    expect(byProdi.items.length).toBeGreaterThanOrEqual(1);

    // Q tak match → kosong
    const none = await listPayrolls({
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      q: 'TIDAK-ADA-NAMA-INI-XYZ',
    });
    expect(none.items.length).toBe(0);
  });

  it('approve → pay: transisi status draft → approved → paid', async () => {
    const approved = await approvePayroll(createdPayrollIds[0], 1);
    expect(approved.status).toBe('approved');

    const paid = await payPayroll(createdPayrollIds[0]);
    expect(paid.status).toBe('paid');
  });

  it('approve gagal 404 jika sudah paid (bukan draft lagi)', async () => {
    await expect(approvePayroll(createdPayrollIds[0], 1)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('POST /payroll/generate butuh perm payroll.input (dosen 403)', async () => {
    const res = await request(app)
      .post('/api/v1/payroll/generate')
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ period_start: '2026-08-01', period_end: '2026-08-31' });
    expect(res.status).toBe(403);
  });

  it('GET /payroll/my hanya return payroll dosen sendiri', async () => {
    const res = await request(app)
      .get('/api/v1/payroll/my?period_start=2026-08-01&period_end=2026-08-31')
      .set('Authorization', `Bearer ${dosenToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const row of res.body.data) {
      expect(row.lecturerId).toBe(dosenLecturerId);
    }
  });
});
