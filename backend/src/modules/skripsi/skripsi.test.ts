// Test setup - configure test database BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= `postgres://${process.env.PGUSER || 'siak'}:${process.env.PGPASSWORD || 'siak_dev_password'}@${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5433}/${process.env.PGDATABASE || 'siak'}`;
process.env.REDIS_URL ??= 'redis://localhost:6380';
process.env.JWT_SECRET ??= 'test-secret-key-min-16-chars';
process.env.BCRYPT_ROUNDS ??= '4';

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

/**
 * Modul Skripsi — proposal & sidang.
 * Endpoint:
 *   GET  /skripsi/supervisors            — mahasiswa: list dosen pembimbing
 *   POST /skripsi/proposals              — mahasiswa submit proposal (1-2 pembimbing)
 *   GET  /skripsi/proposals              — mahasiswa=own, dosen=supervised, admin=all
 *   GET  /skripsi/proposals/:id/statuses — status history
 *   PUT  /skripsi/proposals/:id          — dosen/admin update status
 */
describe('Modul Skripsi — Proposal & Sidang', () => {
  let app: ReturnType<typeof createApp>;
  let mhsToken: string;
  let mhsStudentId: number;
  let dosenToken: string;
  let dosenUserId: number;
  let adminToken: string;
  const createdProposalIds: number[] = [];

  async function login(email: string, password: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    app = createApp({}, { waitingRoom: null });

    // Mahasiswa aktif mana pun
    const mhsRes = await pgPool.query(
      `SELECT s.id AS student_id, u.email FROM students s
       JOIN users u ON u.id = s.user_id
       WHERE s.is_active AND u.is_active
       ORDER BY s.id LIMIT 1`,
    );
    if (mhsRes.rows.length === 0) throw new Error('No mahasiswa available');
    mhsStudentId = Number(mhsRes.rows[0].student_id);
    mhsToken = await login(mhsRes.rows[0].email, 'Mhs123!');

    // Dosen aktif mana pun
    const dosenRes = await pgPool.query(
      `SELECT u.id AS user_id, u.email FROM users u
       JOIN lecturers l ON l.user_id = u.id
       WHERE u.role_id = (SELECT id FROM roles WHERE code = 'dosen')
         AND u.is_active AND l.is_active
       ORDER BY u.id LIMIT 1`,
    );
    if (dosenRes.rows.length === 0) throw new Error('No dosen available');
    dosenUserId = Number(dosenRes.rows[0].user_id);
    dosenToken = await login(dosenRes.rows[0].email, 'Dosen123!');

    // Admin akademik
    const adminRes = await pgPool.query(
      `SELECT u.email FROM users u JOIN roles r ON r.id = u.role_id
       WHERE r.code = 'admin_akademik' AND u.is_active LIMIT 1`,
    );
    adminToken = await login(adminRes.rows[0].email, 'Admin123!');
  });

  afterAll(async () => {
    // Cleanup data yang dibuat test ini
    if (createdProposalIds.length > 0) {
      await pgPool.query(`DELETE FROM skripsi_proposal_statuses WHERE proposal_id = ANY($1)`, [
        createdProposalIds,
      ]);
      await pgPool.query(`DELETE FROM skripsi_proposal_supervisors WHERE proposal_id = ANY($1)`, [
        createdProposalIds,
      ]);
      await pgPool.query(`DELETE FROM skripsi_proposals WHERE id = ANY($1)`, [createdProposalIds]);
    }
    await pgPool.end();
  });

  // ── Autentikasi & otorisasi ──────────────────────────────
  it('tanpa token → 401', async () => {
    await request(app).get('/api/v1/skripsi/proposals').expect(401);
    await request(app).get('/api/v1/skripsi/supervisors').expect(401);
  });

  it('mahasiswa akses PUT proposal → 403 (bukan peran reviewer)', async () => {
    await request(app)
      .put('/api/v1/skripsi/proposals/999999')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({ status: 'disetujui_dosen' })
      .expect(403);
  });

  it('dosen akses GET supervisors → 403 (hanya thesis.submit)', async () => {
    await request(app)
      .get('/api/v1/skripsi/supervisors')
      .set('Authorization', `Bearer ${dosenToken}`)
      .expect(403);
  });

  it('admin akses GET supervisors → 403 (bukan thesis.submit)', async () => {
    await request(app)
      .get('/api/v1/skripsi/supervisors')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  // ── GET /supervisors ─────────────────────────────────────
  it('GET supervisors → list dosen aktif satu prodi', async () => {
    const res = await request(app)
      .get('/api/v1/skripsi/supervisors')
      .set('Authorization', `Bearer ${mhsToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      expect(res.body.data[0]).toHaveProperty('id');
      expect(res.body.data[0]).toHaveProperty('fullName');
      expect(res.body.data[0]).toHaveProperty('nidn');
    }
  });

  // ── POST /proposals ──────────────────────────────────────
  it('POST proposals tanpa supervisorIds → 400 validasi Zod', async () => {
    await request(app)
      .post('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({ title: 'Judul proposal yang cukup panjang untuk validasi' })
      .expect(400);
  });

  it('POST proposals judul terlalu pendek → 400', async () => {
    await request(app)
      .post('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({ title: 'pendek', supervisorIds: [1] })
      .expect(400);
  });

  it('POST proposals supervisorIds kosong → 400', async () => {
    await request(app)
      .post('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({ title: 'Judul proposal yang cukup panjang untuk validasi', supervisorIds: [] })
      .expect(400);
  });

  it('POST proposals lebih dari 2 pembimbing → 400', async () => {
    const many = await pgPool.query(
      `SELECT u.id FROM users u
       JOIN lecturers l ON l.user_id = u.id
       WHERE l.is_active AND u.is_active ORDER BY u.id LIMIT 3`,
    );
    const ids = many.rows.map((r: { id: number }) => Number(r.id));
    await request(app)
      .post('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({ title: 'Judul proposal yang cukup panjang untuk validasi', supervisorIds: ids })
      .expect(400);
  });

  it('POST proposals supervisor tidak ada → 404', async () => {
    await request(app)
      .post('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({
        title: 'Judul proposal yang cukup panjang untuk validasi',
        supervisorIds: [999999999],
      })
      .expect(404);
  });

  it('POST proposals sukses (1 pembimbing) → 201 + riwayat status dibuat', async () => {
    const supRes = await pgPool.query(
      `SELECT u.id FROM users u
       JOIN lecturers l ON l.user_id = u.id
       WHERE l.is_active AND u.is_active ORDER BY u.id LIMIT 1`,
    );
    const supervisorId = Number(supRes.rows[0].id);

    const res = await request(app)
      .post('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({
        title: 'Rancangan Sistem Informasi Akademik Berbasis Web',
        supervisorIds: [supervisorId],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    const proposalId = Number(res.body.data.id);
    createdProposalIds.push(proposalId);
    expect(res.body.data.status).toBe('diajukan');

    // Junction table terisi dengan is_primary=true
    const junc = await pgPool.query(
      `SELECT is_primary FROM skripsi_proposal_supervisors
       WHERE proposal_id = $1 AND supervisor_id = $2`,
      [proposalId, supervisorId],
    );
    expect(junc.rows).toHaveLength(1);
    expect(junc.rows[0].is_primary).toBe(true);

    // Riwayat status awal
    const hist = await pgPool.query(
      `SELECT status FROM skripsi_proposal_statuses WHERE proposal_id = $1`,
      [proposalId],
    );
    expect(hist.rows).toHaveLength(1);
    expect(hist.rows[0].status).toBe('diajukan');
  });

  it('POST proposals sukses (2 pembimbing) → 201 + primary di posisi pertama', async () => {
    const supRes = await pgPool.query(
      `SELECT u.id FROM users u
       JOIN lecturers l ON l.user_id = u.id
       WHERE l.is_active AND u.is_active ORDER BY u.id LIMIT 2`,
    );
    if (supRes.rows.length < 2) return; // skip jika seed kurang
    const ids = supRes.rows.map((r: { id: number }) => Number(r.id));

    const res = await request(app)
      .post('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .send({
        title: 'Penerapan Machine Learning Untuk Prediksi Kelulusan Mahasiswa',
        supervisorIds: ids,
      })
      .expect(201);

    const proposalId = Number(res.body.data.id);
    createdProposalIds.push(proposalId);

    const junc = await pgPool.query(
      `SELECT supervisor_id, is_primary FROM skripsi_proposal_supervisors
       WHERE proposal_id = $1 ORDER BY is_primary DESC`,
      [proposalId],
    );
    expect(junc.rows).toHaveLength(2);
    expect(Number(junc.rows[0].supervisor_id)).toBe(ids[0]);
    expect(junc.rows[0].is_primary).toBe(true);
    expect(junc.rows[1].is_primary).toBe(false);
  });

  // ── GET /proposals (role-based scoping) ───────────────────
  it('GET proposals mahasiswa → hanya proposal sendiri', async () => {
    const res = await request(app)
      .get('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${mhsToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    for (const p of res.body.data) {
      expect(Number(p.studentId)).toBe(mhsStudentId);
    }
    expect(res.body.pagination).toHaveProperty('total');
  });

  it('GET proposals dosen → hanya proposal yang diampu', async () => {
    const res = await request(app)
      .get('/api/v1/skripsi/proposals')
      .set('Authorization', `Bearer ${dosenToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Semua baris harus punya dosen ini di daftar supervisors
    for (const p of res.body.data) {
      const ids = (p.supervisors ?? []).map((s: { id: number }) => Number(s.id));
      expect(ids).toContain(dosenUserId);
    }
  });

  it('GET proposals admin → semua proposal + pagination', async () => {
    const res = await request(app)
      .get('/api/v1/skripsi/proposals?limit=5&page=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.pagination.limit).toBe(5);
    expect(res.body.pagination.page).toBe(1);
  });

  // ── GET /proposals/:id/statuses ──────────────────────────
  it('GET statuses ID bukan angka → 400', async () => {
    await request(app)
      .get('/api/v1/skripsi/proposals/abc/statuses')
      .set('Authorization', `Bearer ${mhsToken}`)
      .expect(400);
  });

  it('GET statuses proposal yang baru dibuat → berisi diajukan', async () => {
    if (createdProposalIds.length === 0) return;
    const res = await request(app)
      .get(`/api/v1/skripsi/proposals/${createdProposalIds[0]}/statuses`)
      .set('Authorization', `Bearer ${mhsToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty('changedByName');
  });

  // ── PUT /proposals/:id (review dosen/admin) ──────────────
  it('PUT proposals ID bukan angka → 400', async () => {
    await request(app)
      .put('/api/v1/skripsi/proposals/abc')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disetujui_dosen' })
      .expect(400);
  });

  it('PUT proposals status invalid → 400', async () => {
    if (createdProposalIds.length === 0) return;
    await request(app)
      .put(`/api/v1/skripsi/proposals/${createdProposalIds[0]}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'status_ngawur' })
      .expect(400);
  });

  it('PUT proposals tidak ditemukan → 404', async () => {
    await request(app)
      .put('/api/v1/skripsi/proposals/999999999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'disetujui_dosen' })
      .expect(404);
  });

  it('PUT proposals oleh dosen → disetujui_dosen + reviewedBy terisi', async () => {
    if (createdProposalIds.length === 0) return;
    const res = await request(app)
      .put(`/api/v1/skripsi/proposals/${createdProposalIds[0]}`)
      .set('Authorization', `Bearer ${dosenToken}`)
      .send({ status: 'disetujui_dosen', statusNotes: 'Revisi minor sudah baik' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('disetujui_dosen');
    expect(Number(res.body.data.reviewed_by)).toBe(dosenUserId);

    // Riwayat bertambah
    const hist = await pgPool.query(
      `SELECT status, notes FROM skripsi_proposal_statuses
       WHERE proposal_id = $1 ORDER BY changed_at DESC`,
      [createdProposalIds[0]],
    );
    expect(hist.rows[0].status).toBe('disetujui_dosen');
    expect(hist.rows[0].notes).toBe('Revisi minor sudah baik');
  });

  it('PUT proposals oleh admin → dalam_bimbingan', async () => {
    if (createdProposalIds.length === 0) return;
    const res = await request(app)
      .put(`/api/v1/skripsi/proposals/${createdProposalIds[0]}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'dalam_bimbingan' })
      .expect(200);

    expect(res.body.data.status).toBe('dalam_bimbingan');
    // statusNotes opsional → null
    expect(res.body.data.status_notes).toBeNull();
  });
});
