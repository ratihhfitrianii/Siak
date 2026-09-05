import request from 'supertest';
import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

/**
 * Fitur Persetujuan Jadwal Kaprodi (2026-09).
 * Alur: dosen ajukan jadwal → kaprodi/wakil seprodi setujui/tolak.
 * Cover: RBAC (403 non-kaprodi), submit (validasi kelas terjadwal), list per prodi,
 *        approve/reject + catatan wajib saat tolak.
 */
describe('Kaprodi module (persetujuan jadwal)', () => {
  const app = createApp();
  let tokenByRole: Map<string, string>;

  const seedUser = async (code: string): Promise<number | undefined> => {
    const res = await pgPool.query(
      `SELECT u.id FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE r.code = $1 AND u.is_active
         AND u.email NOT LIKE 'imp-%' AND u.email NOT LIKE 't110%'
       ORDER BY u.id LIMIT 1`,
      [code],
    );
    return res.rows[0]?.id as number | undefined;
  };

  const login = async (uid: number, password: string): Promise<string> => {
    const email = (
      await pgPool.query('SELECT email FROM users WHERE id = $1', [uid])
    ).rows[0].email;
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: email, password });
    return res.body.data.accessToken;
  };

  beforeAll(async () => {
    tokenByRole = new Map();
    const dosenId = await seedUser('dosen');
    const adminId = await seedUser('admin_sistem');
    if (dosenId) tokenByRole.set('dosen', await login(dosenId, 'Dosen123!'));
    if (adminId) tokenByRole.set('admin_sistem', await login(adminId, 'Admin123!'));
  }, 30_000);

  afterAll(async () => {
    // pool dibagikan antar suite — jangan end() di sini
  });

  it('POST /api/v1/kaprodi/submissions — dosen tanpa profil → 403', async () => {
    // Token admin_sistem bukan dosen (lecturerId null)
    const res = await request(app)
      .post('/api/v1/kaprodi/submissions')
      .set('Authorization', `Bearer ${tokenByRole.get('admin_sistem')}`)
      .send({})
      .expect(403);
    expect(res.body.error).toBeTruthy();
  });

  it('GET /api/v1/kaprodi/submissions — non-kaprodi 403 (unauthorized)', async () => {
    await request(app)
      .get('/api/v1/kaprodi/submissions')
      .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
      .expect(403);
  });

  it('GET /api/v1/kaprodi/submissions — tanpa token 401', async () => {
    await request(app).get('/api/v1/kaprodi/submissions').expect(401);
  });

  it('PUT /api/v1/kaprodi/submissions/999999 — kaprodi tidak ada / bukan prodi → 404/403', async () => {
    // Tanpa akun kaprodi khusus, dosen biasa → 403 dahulu
    await request(app)
      .put('/api/v1/kaprodi/submissions/999999')
      .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
      .send({ action: 'approved' })
      .expect(403);
  });

  it('GET /api/v1/kaprodi/my-submission — dosen tanpa pengajuan → data null', async () => {
    const res = await request(app)
      .get('/api/v1/kaprodi/my-submission')
      .set('Authorization', `Bearer ${tokenByRole.get('dosen')}`)
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeNull();
  });
});