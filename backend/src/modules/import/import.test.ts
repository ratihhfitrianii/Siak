import { beforeAll, afterAll, describe, it, expect } from '@jest/globals';
import bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import request from 'supertest';

// Env test SEBELUM import app (port 5433 = DB test; lihat infra/docker-compose.yml)
process.env.NODE_ENV = 'test';
// ??= (bukan =) agar env CI (port 5432) dihormati — di lokal default 5433.
// Pakai = di sini = bug T1.10: CI menimpa paksa ke 5433 → ECONNREFUSED → login 500.
process.env.DATABASE_URL ??= 'postgres://siak:siak_dev_password@localhost:5433/siak';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-secret-import';

import { createApp } from '../../app';
import { pgPool } from '../../lib/pg';

const app = createApp();

const password = 'TestPass123!';
const adminEmail = 'admin@siak.local';
const adminPassword = 'Admin123!';

describe('Modul Impor (T1.10)', () => {
  const ts = Date.now().toString().slice(-6);
  let adminToken = '';
  let mahasiswaToken = '';
  let dosenToken = '';
  let adminAkademikToken = '';
  let adminId = 0;
  let prodiCode = '';
  let angkatanCode = '';
  const createdEmails: string[] = [];
  const createdCourses: string[] = [];

  const insertUser = async (email: string, role: string, fullName: string) => {
    const hash = await bcrypt.hash(password, 10);
    const res = await pgPool.query(
      `INSERT INTO users (email, password_hash, full_name, role_id, is_active)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE code = $4), true)
       RETURNING id`,
      [email, hash, fullName, role],
    );
    return Number(res.rows[0].id);
  };

  const login = async (email: string, pw: string) => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password: pw })
      .expect(200);
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    // Token admin sistem (seed)
    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);
    adminToken = adminLogin.body.data.accessToken;
    adminId = Number(adminLogin.body.data.user.id);
    expect(adminLogin.body.data.user.mustChangePassword).toBe(false);

    // User test untuk RBAC (mahasiswa, dosen, admin_akademik)
    const mhsId = await insertUser(`imp-mhs-${ts}@siak.local`, 'mahasiswa', 'Mhs Impor Test');
    const dosenId = await insertUser(`imp-dosen-${ts}@siak.local`, 'dosen', 'Dosen Impor Test');
    await insertUser(`imp-admak-${ts}@siak.local`, 'admin_akademik', 'AdmAk Impor Test');
    createdEmails.push(
      `imp-mhs-${ts}@siak.local`,
      `imp-dosen-${ts}@siak.local`,
      `imp-admak-${ts}@siak.local`,
    );

    await pgPool.query(
      `INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, is_active, status)
       VALUES ($1, 'x${ts}99', (SELECT id FROM prodis WHERE is_active LIMIT 1),
               (SELECT id FROM academic_years WHERE is_active LIMIT 1), 'Mandiri', true, 'aktif')`,
      [mhsId],
    );
    await pgPool.query(
      `INSERT INTO lecturers (user_id, nidn, prodi_id, employment_type, is_active)
       VALUES ($1, 'n${ts}99', (SELECT id FROM prodis WHERE is_active LIMIT 1), 'tetap', true)`,
      [dosenId],
    );

    mahasiswaToken = await login(`imp-mhs-${ts}@siak.local`, password);
    dosenToken = await login(`imp-dosen-${ts}@siak.local`, password);
    adminAkademikToken = await login(`imp-admak-${ts}@siak.local`, password);

    const prodiRes = await pgPool.query(
      'SELECT code FROM prodis WHERE is_active ORDER BY id LIMIT 1',
    );
    prodiCode = prodiRes.rows[0].code;
    const ayRes = await pgPool.query(
      'SELECT code FROM academic_years WHERE is_active ORDER BY id LIMIT 1',
    );
    angkatanCode = ayRes.rows[0].code;
  });

  afterAll(async () => {
    // Hapus audit import test (filename prefix T110-)
    await pgPool.query(
      `DELETE FROM audit_logs WHERE action = 'IMPORT' AND changed_by = $1
       AND new_values->>'filename' LIKE 'T110-%'`,
      [adminId],
    );
    // Cleanup BERBASIS POLA (bukan list createdEmails): robust walau sebuah test
    // gagal di tengah SEBELUM createdEmails.push dieksekusi — user yang sudah
    // dibuat modul tetap terhapus (pelajaran §19.2 #7). ts unik per run.
    // T1.13: bersihkan SEMUA leftover imp-*/t110* dari run manapun — leftover
    // run lama terpilih acak oleh grades.test.ts (dosen2/mahasiswa2 tanpa ORDER BY)
    // → login 'Dosen123!' salah → failed_login_attempts → akun terkunci → suite lain 401.
    await pgPool.query(
      `DELETE FROM users
       WHERE email LIKE 'imp-%@siak.local'
          OR email LIKE 't110%@student.siak.local'
          OR email LIKE 't110%@siak.local'`,
    );
    for (const code of createdCourses) {
      await pgPool.query('DELETE FROM courses WHERE code = $1', [code]);
    }
  });

  const buildCsv = (header: string[], rows: string[][]): Buffer => {
    const lines = [header.join(','), ...rows.map((r) => r.join(','))];
    return Buffer.from(lines.join('\n'), 'utf-8');
  };

  describe('RBAC — hanya Admin Sistem (import.data)', () => {
    it('mahasiswa / dosen / admin_akademik → 403', async () => {
      const csv = buildCsv(
        ['nim', 'full_name', 'prodi_code', 'angkatan'],
        [[`T110-${ts}-r`, 'RBAC', prodiCode, angkatanCode]],
      );
      for (const token of [mahasiswaToken, dosenToken, adminAkademikToken]) {
        const res = await request(app)
          .post('/api/v1/import/students')
          .set('Authorization', `Bearer ${token}`)
          .attach('file', csv, { filename: 'T110-rbac.csv', contentType: 'text/csv' });
        expect(res.status).toBe(403);
      }
    });

    it('tanpa token → 401', async () => {
      const res = await request(app)
        .post('/api/v1/import/students')
        .attach('file', Buffer.from('a,b\n1,2'), {
          filename: 'T110-x.csv',
          contentType: 'text/csv',
        });
      expect(res.status).toBe(401);
    });
  });

  describe('Validasi file', () => {
    it('tanpa file → 400 FILE_REQUIRED', async () => {
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
      expect(res.body.error.code).toBe('FILE_REQUIRED');
    });

    it('ekstensi .txt → 400 UNSUPPORTED_FILE', async () => {
      const res = await request(app)
        .post('/api/v1/import/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('kode,nama,sks\nA,Matkul,3'), {
          filename: 'T110-x.txt',
          contentType: 'text/plain',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('UNSUPPORTED_FILE');
    });

    it('hanya header (tanpa baris data) → 400 EMPTY_FILE', async () => {
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('nim,full_name,prodi_code,angkatan\n'), {
          filename: 'T110-empty.csv',
          contentType: 'text/csv',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('EMPTY_FILE');
    });

    it('kolom wajib hilang → 400 INVALID_HEADERS', async () => {
      const csv = buildCsv(['nim', 'full_name'], [[`T110-${ts}-h`, 'No Prodi']]);
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-badhead.csv', contentType: 'text/csv' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_HEADERS');
      expect(res.body.error.message).toContain('prodi_code');
    });

    it('file > 2MB → 400 FILE_TOO_LARGE (multer limit)', async () => {
      const big = Buffer.alloc(2 * 1024 * 1024 + 1024, 'a');
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', big, { filename: 'T110-big.csv', contentType: 'text/csv' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('FILE_TOO_LARGE');
    });

    it('file .xlsx rusak → 400 PARSE_ERROR', async () => {
      const res = await request(app)
        .post('/api/v1/import/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', Buffer.from('ini bukan xlsx'), {
          filename: 'T110-bad.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PARSE_ERROR');
    });
  });

  describe('Import mahasiswa (upsert NIM, K-08)', () => {
    it('baris baru + NIM existing → inserted/updated + login default password + mustChangePassword', async () => {
      const nimNew = `t110${ts}1`;
      const nimExisting = `x${ts}99`;
      const csv = buildCsv(
        ['nim', 'full_name', 'prodi_code', 'angkatan'],
        [
          [nimNew, 'Mhs Baru Impor', prodiCode, angkatanCode],
          [nimExisting, 'Mhs Existing Diupdate', prodiCode, angkatanCode],
        ],
      );
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-students.csv', contentType: 'text/csv' })
        .expect(200);
      expect(res.body.data).toMatchObject({ total: 2, inserted: 1, updated: 1 });
      expect(res.body.data.failed).toEqual([]);
      createdEmails.push(`${nimNew}@student.siak.local`);

      // Akun baru: login dengan password default → flag wajib ganti password
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${nimNew}@student.siak.local`, password: 'Siak123!' })
        .expect(200);
      expect(loginRes.body.data.user.mustChangePassword).toBe(true);
      expect(loginRes.body.data.user.role).toBe('mahasiswa');

      // NIM existing: profil mahasiswa ter-update
      const updated = await pgPool.query(
        'SELECT full_name FROM students s JOIN users u ON u.id = s.user_id WHERE s.nim = $1',
        [nimExisting],
      );
      expect(updated.rows[0].full_name).toBe('Mhs Existing Diupdate');
    });

    it('baris tidak valid → dilaporkan + alasan, baris valid tetap masuk', async () => {
      const nimOk = `t110${ts}2`;
      const csv = buildCsv(
        ['nim', 'full_name', 'prodi_code', 'angkatan', 'kontak'],
        [
          [nimOk, 'Mhs Valid', prodiCode, angkatanCode, ''],
          ['', 'Tanpa NIM', prodiCode, angkatanCode, ''], // nim kosong → mapColumns buang → schema gagal
          [`t110${ts}3`, 'Prodi Salah', 'ZZZ', angkatanCode, ''],
          [`t110${ts}4`, 'Angkatan Salah', prodiCode, '1900', ''],
          [`t110${ts}5`, 'Email Salah', prodiCode, angkatanCode, 'not-an-email'],
        ],
      );
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-students-fail.csv', contentType: 'text/csv' })
        .expect(200);
      expect(res.body.data.inserted).toBe(1);
      expect(res.body.data.failed).toHaveLength(4);
      const reasons = res.body.data.failed.map((f: { reason: string }) => f.reason).join('; ');
      expect(reasons).toContain('Prodi "ZZZ" tidak ditemukan');
      expect(reasons).toContain('Angkatan "1900" tidak ditemukan');
      expect(reasons).toContain('kontak');
      createdEmails.push(`${nimOk}@student.siak.local`);
    });

    it('NIM duplikat dalam satu file → baris kedua jadi update', async () => {
      const nimDup = `t110${ts}9`;
      const csv = buildCsv(
        ['nim', 'full_name', 'prodi_code', 'angkatan'],
        [
          [nimDup, 'Duplikat Satu', prodiCode, angkatanCode],
          [nimDup, 'Duplikat Dua', prodiCode, angkatanCode],
        ],
      );
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-students-dup.csv', contentType: 'text/csv' })
        .expect(200);
      expect(res.body.data).toMatchObject({ total: 2, inserted: 1, updated: 1 });
      createdEmails.push(`${nimDup}@student.siak.local`);
    });

    it('konflik user (email dipakai user yang sudah punya student) → baris gagal "Kesalahan database"', async () => {
      // User test sudah punya student (mhsId) — impor kontak=email user itu, nim BARU
      // → ON CONFLICT (email) memakai user existing → students.user_id UNIQUE violation
      const dupEmail = `imp-mhs-${ts}@siak.local`;
      const csv = buildCsv(
        ['nim', 'full_name', 'prodi_code', 'angkatan', 'kontak'],
        [[`t110${ts}8`, 'Konflik User', prodiCode, angkatanCode, dupEmail]],
      );
      const res = await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-conflict.csv', contentType: 'text/csv' })
        .expect(200);
      expect(res.body.data.inserted).toBe(0);
      expect(res.body.data.failed).toHaveLength(1);
      expect(res.body.data.failed[0].reason).toContain('Kesalahan database');
    });
  });

  describe('Import dosen (upsert NIDN)', () => {
    it('baris baru + NIDN existing → inserted/updated; tanpa NIDN → gagal', async () => {
      const nidnNew = `t110${ts}1`;
      const nidnExisting = `n${ts}99`;
      const csv = buildCsv(
        ['nidn', 'full_name', 'prodi_code'],
        [
          [nidnNew, 'Dosen Baru Impor', prodiCode],
          [nidnExisting, 'Dosen Existing Diupdate', prodiCode],
          ['', 'Tanpa NIDN', prodiCode],
        ],
      );
      const res = await request(app)
        .post('/api/v1/import/lecturers')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-lecturers.csv', contentType: 'text/csv' })
        .expect(200);
      expect(res.body.data).toMatchObject({ total: 3, inserted: 1, updated: 1 });
      expect(res.body.data.failed).toHaveLength(1);
      createdEmails.push(`${nidnNew}@siak.local`);

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: `${nidnNew}@siak.local`, password: 'Siak123!' })
        .expect(200);
      expect(loginRes.body.data.user.role).toBe('dosen');
      expect(loginRes.body.data.user.mustChangePassword).toBe(true);

      const updated = await pgPool.query(
        'SELECT full_name FROM lecturers l JOIN users u ON u.id = l.user_id WHERE l.nidn = $1',
        [nidnExisting],
      );
      expect(updated.rows[0].full_name).toBe('Dosen Existing Diupdate');
    });
  });

  describe('Import mata kuliah (upsert kode, CSV + XLSX)', () => {
    it('CSV: baru + existing → inserted/updated; sks 0 → gagal', async () => {
      const codeNew = `t110${ts}A`;
      const codeExisting = 'IMPOR-EXIST';
      await pgPool.query(
        `INSERT INTO courses (code, name, credits) VALUES ($1, 'Matkul Existing', 2)
         ON CONFLICT (code) DO NOTHING`,
        [codeExisting],
      );
      createdCourses.push(codeExisting);
      const csv = buildCsv(
        ['kode', 'nama', 'sks'],
        [
          [codeNew, 'Matkul Baru', '3'],
          [codeExisting, 'Matkul Existing Diupdate', '4'],
          [`t110${ts}B`, 'SKS Nol', '0'],
        ],
      );
      const res = await request(app)
        .post('/api/v1/import/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-courses.csv', contentType: 'text/csv' })
        .expect(200);
      expect(res.body.data).toMatchObject({ total: 3, inserted: 1, updated: 1 });
      expect(res.body.data.failed).toHaveLength(1);
      createdCourses.push(codeNew, `t110${ts}B`);
    });

    it('XLSX (.xlsx) via exceljs → inserted', async () => {
      const codeXlsx = `t110${ts}X`;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Matkul');
      ws.addRow(['kode', 'nama', 'sks']);
      ws.addRow([codeXlsx, 'Matkul Dari Excel', 2]);
      const buf = await wb.xlsx.writeBuffer();
      const res = await request(app)
        .post('/api/v1/import/courses')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', buf as unknown as string, {
          filename: 'T110-courses.xlsx',
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        .expect(200);
      expect(res.body.data).toMatchObject({ total: 1, inserted: 1, updated: 0 });
      expect(res.body.data.failed).toEqual([]);
      createdCourses.push(codeXlsx);
    });
  });

  describe('Audit trail impor (F-13, S-06)', () => {
    it('jejak IMPORT tercatat atomik (table_name + ringkasan newValues)', async () => {
      // Import kecil → cek jejak terbaru
      const nimAudit = `t110${ts}7`;
      const csv = buildCsv(
        ['nim', 'full_name', 'prodi_code', 'angkatan'],
        [[nimAudit, 'Mhs Audit Impor', prodiCode, angkatanCode]],
      );
      await request(app)
        .post('/api/v1/import/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', csv, { filename: 'T110-audit.csv', contentType: 'text/csv' })
        .expect(200);
      createdEmails.push(`${nimAudit}@student.siak.local`);

      const audit = await pgPool.query(
        `SELECT table_name, action, changed_by, new_values
         FROM audit_logs
         WHERE action = 'IMPORT' AND changed_by = $1 AND new_values->>'filename' = 'T110-audit.csv'
         ORDER BY id DESC LIMIT 1`,
        [adminId],
      );
      expect(audit.rowCount).toBe(1);
      expect(audit.rows[0].table_name).toBe('students');
      expect(audit.rows[0].new_values).toMatchObject({
        total: 1,
        inserted: 1,
        updated: 0,
        failedCount: 0,
      });
    });
  });
});
