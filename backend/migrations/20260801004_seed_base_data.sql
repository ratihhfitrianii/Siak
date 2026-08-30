-- V20260801_004__seed_base_data.sql
-- Seed data: roles, faculties, prodis, academic_years, semesters, default admin users

-- roles (5 tipe akun per DL-08)
INSERT INTO roles (code, name, description) VALUES
    ('mahasiswa', 'Mahasiswa', 'Mahasiswa aktif kampus'),
    ('dosen', 'Dosen', 'Dosen pengampu mata kuliah (termasuk Wali via is_wali)'),
    ('admin_akademik', 'Admin Akademik', 'Admin urusan akademik: KRS approve, kurikulum, nilai'),
    ('admin_keuangan', 'Admin Keuangan', 'Admin urusan keuangan: tagihan, pembayaran, payroll'),
    ('admin_sistem', 'Admin Sistem (Superuser)', 'Akses penuh semua modul + audit trail')
ON CONFLICT (code) DO NOTHING;

-- faculties (contoh 3 fakultas)
INSERT INTO faculties (code, name) VALUES
    ('FTI', 'Fakultas Teknologi Informasi'),
    ('FE', 'Fakultas Ekonomi'),
    ('FH', 'Fakultas Hukum')
ON CONFLICT (code) DO NOTHING;

-- prodis (contoh 6 prodi)
INSERT INTO prodis (faculty_id, code, name, degree, accreditation) VALUES
    ((SELECT id FROM faculties WHERE code='FTI'), 'TI', 'Teknik Informatika', 'S1', 'A'),
    ((SELECT id FROM faculties WHERE code='FTI'), 'SI', 'Sistem Informasi', 'S1', 'A'),
    ((SELECT id FROM faculties WHERE code='FE'), 'MNJ', 'Manajemen', 'S1', 'B'),
    ((SELECT id FROM faculties WHERE code='FE'), 'AKT', 'Akuntansi', 'S1', 'A'),
    ((SELECT id FROM faculties WHERE code='FH'), 'HKM', 'Hukum', 'S1', 'B'),
    ((SELECT id FROM faculties WHERE code='FH'), 'KN', 'Kenotariatan', 'D3', 'B')
ON CONFLICT (code) DO NOTHING;

-- academic_years (contoh 3 tahun akademik)
INSERT INTO academic_years (code, start_date, end_date, is_active) VALUES
    ('2023/2024', '2023-08-01', '2024-07-31', false),
    ('2024/2025', '2024-08-01', '2025-07-31', true),
    ('2025/2026', '2025-08-01', '2026-07-31', false)
ON CONFLICT (code) DO NOTHING;

-- semesters (ganjil/genap per tahun akademik)
INSERT INTO semesters (academic_year_id, code, name, start_date, end_date, krs_start_date, krs_end_date, is_active) VALUES
    -- 2023/2024
    ((SELECT id FROM academic_years WHERE code='2023/2024'), '2023/2024-1', 'Ganjil 2023/2024', '2023-08-01', '2024-01-31', '2023-07-15', '2023-08-15', false),
    ((SELECT id FROM academic_years WHERE code='2023/2024'), '2023/2024-2', 'Genap 2023/2024', '2024-02-01', '2024-07-31', '2024-01-15', '2024-02-15', false),
    -- 2024/2025 (aktif)
    ((SELECT id FROM academic_years WHERE code='2024/2025'), '2024/2025-1', 'Ganjil 2024/2025', '2024-08-01', '2025-01-31', '2024-07-15', '2024-08-15', true),
    ((SELECT id FROM academic_years WHERE code='2024/2025'), '2024/2025-2', 'Genap 2024/2025', '2025-02-01', '2025-07-31', '2025-01-15', '2025-02-15', false),
    -- 2025/2026
    ((SELECT id FROM academic_years WHERE code='2025/2026'), '2025/2026-1', 'Ganjil 2025/2026', '2025-08-01', '2026-01-31', '2025-07-15', '2025-08-15', false),
    ((SELECT id FROM academic_years WHERE code='2025/2026'), '2025/2026-2', 'Genap 2025/2026', '2026-02-01', '2026-07-31', '2026-01-15', '2026-02-15', false)
ON CONFLICT (academic_year_id, code) DO NOTHING;

-- krs_periods untuk semester aktif
INSERT INTO krs_periods (semester_id, name, start_date, end_date, is_revision, is_active) VALUES
    ((SELECT id FROM semesters WHERE code='2024/2025-1'), 'KRS Utama Ganjil 2024/2025', '2024-07-15 00:00:00+07', '2024-08-15 23:59:59+07', false, true),
    ((SELECT id FROM semesters WHERE code='2024/2025-1'), 'KRS Revisi Ganjil 2024/2025', '2024-08-16 00:00:00+07', '2024-09-15 23:59:59+07', true, false)
ON CONFLICT (semester_id, name) DO NOTHING;

-- default admin users (password: 'Admin123!' - bcrypt hash)
-- Admin Sistem
INSERT INTO users (email, password_hash, full_name, role_id, is_active) VALUES
    ('admin@siak.local', '$2b$12$8HU58T/7ACy5X9z2WhzQveyfvkvbEEhJOlB8Mz.xpyvTdUMMsVKCa', 'Admin Sistem', (SELECT id FROM roles WHERE code='admin_sistem'), true)
ON CONFLICT (email) DO NOTHING;

-- Admin Akademik
INSERT INTO users (email, password_hash, full_name, role_id, is_active) VALUES
    ('akademik@siak.local', '$2b$12$8HU58T/7ACy5X9z2WhzQveyfvkvbEEhJOlB8Mz.xpyvTdUMMsVKCa', 'Admin Akademik', (SELECT id FROM roles WHERE code='admin_akademik'), true)
ON CONFLICT (email) DO NOTHING;

-- Admin Keuangan
INSERT INTO users (email, password_hash, full_name, role_id, is_active) VALUES
    ('keuangan@siak.local', '$2b$12$8HU58T/7ACy5X9z2WhzQveyfvkvbEEhJOlB8Mz.xpyvTdUMMsVKCa', 'Admin Keuangan', (SELECT id FROM roles WHERE code='admin_keuangan'), true)
ON CONFLICT (email) DO NOTHING;