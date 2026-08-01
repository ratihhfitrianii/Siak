-- V20260801_005__seed_development_data.sql
-- Seed development: ~2000 mahasiswa, ~100 dosen, courses, curricula, classes
-- Dijalankan HANYA di development (bukan production)

-- courses (mata kuliah contoh - 30 mata kuliah)
INSERT INTO courses (code, name, credits, description) VALUES
    ('TI101', 'Pemrograman Dasar', 3, 'Dasar-dasar pemrograman'),
    ('TI102', 'Struktur Data', 3, 'Struktur data dan algoritma'),
    ('TI103', 'Algoritma dan Pemrograman', 3, 'Algoritma fundamental'),
    ('TI201', 'Basis Data', 3, 'Sistem basis data relasional'),
    ('TI202', 'Pemrograman Web', 3, 'Pengembangan aplikasi web'),
    ('TI203', 'Jaringan Komputer', 3, 'Dasar jaringan komputer'),
    ('TI301', 'Rekayasa Perangkat Lunak', 3, 'Metodologi rekayasa perangkat lunak'),
    ('TI302', 'Kecerdasan Buatan', 3, 'Dasar kecerdasan buatan'),
    ('TI303', 'Keamanan Siber', 3, 'Keamanan jaringan dan aplikasi'),
    ('TI401', 'Proyek Akhir 1', 4, 'Penelitian dan desain sistem'),
    ('TI402', 'Proyek Akhir 2', 4, 'Implementasi dan pengujian'),
    ('SI101', 'Pengantar Sistem Informasi', 3, 'Dasar sistem informasi'),
    ('SI102', 'Analisis dan Desain Sistem', 3, 'Metode analisis desain'),
    ('SI201', 'Manajemen Proyek TI', 3, 'Manajemen proyek teknologi informasi'),
    ('SI202', 'Enterprise Resource Planning', 3, 'Sistem ERP'),
    ('SI301', 'Business Intelligence', 3, 'Analisis data bisnis'),
    ('SI302', 'E-Commerce', 3, 'Perdagangan elektronik'),
    ('SI401', 'Strategi SI', 3, 'Strategi sistem informasi'),
    ('MNJ101', 'Manajemen Dasar', 3, 'Prinsip manajemen'),
    ('MNJ201', 'Perilaku Organisasi', 3, 'Perilaku dalam organisasi'),
    ('MNJ301', 'Manajemen Sumber Daya Manusia', 3, 'Manajemen SDM'),
    ('AKT101', 'Akuntansi Dasar', 3, 'Dasar-dasar akuntansi'),
    ('AKT201', 'Akuntansi Menengah', 3, 'Akuntansi tingkat menengah'),
    ('AKT301', 'Audit', 3, 'Prinsip audit'),
    ('HKM101', 'Hukum Perdata', 3, 'Hukum perdata Indonesia'),
    ('HKM201', 'Hukum Pidana', 3, 'Hukum pidana Indonesia'),
    ('HKM301', 'Hukum Bisnis', 3, 'Hukum perdagangan dan bisnis'),
    ('KN101', 'Kenotariatan Dasar', 3, 'Dasar kenotariatan'),
    ('KN201', 'Hukum Waris', 3, 'Hukum waris Islam/Kitab Undang-Undang'),
    ('KN301', 'Akta Notaris', 3, 'Pembuatan akta notaris')
ON CONFLICT (code) DO NOTHING;

-- curricula untuk TI (S1) - semester 1
INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
SELECT p.id, s.id, c.id, true, 1
FROM prodis p
JOIN semesters s ON s.code = '2024/2025-1'
JOIN courses c ON c.code IN ('TI101', 'TI103', 'SI101')
WHERE p.code = 'TI'
ON CONFLICT DO NOTHING;

-- curricula untuk SI (S1) - semester 1
INSERT INTO curricula (prodi_id, semester_id, course_id, is_mandatory, semester_number)
SELECT p.id, s.id, c.id, true, 1
FROM prodis p
JOIN semesters s ON s.code = '2024/2025-1'
JOIN courses c ON c.code IN ('SI101', 'SI102', 'TI101')
WHERE p.code = 'SI'
ON CONFLICT DO NOTHING;

-- dosen: ~100 dosen (~17 per prodi)
WITH prodi_list AS (
    SELECT id, code, row_number() OVER () as rn FROM prodis WHERE is_active
),
dosen_data AS (
    SELECT 
        pl.id as prodi_id,
        pl.code as prodi_code,
        j as dosen_num,
        'dosen.' || pl.code || j || '@siak.local' as email,
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PZvO.S' as password_hash,
        'Dosen ' || pl.code || ' ' || j as full_name,
        (SELECT id FROM roles WHERE code='dosen') as role_id,
        (198001001 + j)::TEXT as nidn,
        CASE WHEN j <= 10 THEN 'tetap' ELSE 'kontrak' END as employment_type,
        '123456789' || LPAD(j::TEXT, 3, '0') as bank_account
    FROM prodi_list pl
    CROSS JOIN generate_series(1, 17) j
),
dosen_users AS (
    INSERT INTO users (email, password_hash, full_name, role_id, is_active)
    SELECT email, password_hash, full_name, role_id, true
    FROM dosen_data
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email
)
INSERT INTO lecturers (user_id, nidn, prodi_id, employment_type, bank_account, is_active)
SELECT du.id, dd.nidn, dd.prodi_id, dd.employment_type, dd.bank_account, true
FROM dosen_users du
JOIN dosen_data dd ON du.email = dd.email
ON CONFLICT DO NOTHING;

-- mahasiswa: ~2000 mahasiswa (~167 per prodi per angkatan)
WITH prodi_list AS (
    SELECT id, code FROM prodis WHERE is_active
),
ay_list AS (
    SELECT id, code FROM academic_years WHERE code IN ('2023/2024', '2024/2025')
),
mhs_data AS (
    SELECT 
        pl.id as prodi_id,
        pl.code as prodi_code,
        ay.id as academic_year_id,
        ay.code as academic_year_code,
        i as mhs_num,
        'mhs.' || pl.code || '_' || ay.code || '_' || i || '@siak.local' as email,
        '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PZvO.S' as password_hash,
        'Mahasiswa ' || pl.code || ' ' || i as full_name,
        (SELECT id FROM roles WHERE code='mahasiswa') as role_id,
        (20240000 + (ROW_NUMBER() OVER (ORDER BY pl.code, ay.code, i)))::TEXT as nim,
        CASE (i % 4) 
            WHEN 0 THEN 'SBMPTN' 
            WHEN 1 THEN 'SNMPTN' 
            WHEN 2 THEN 'Mandiri' 
            ELSE 'Transfer' 
        END as entry_type,
        75 + (i % 25) as entry_test_score
    FROM prodi_list pl
    CROSS JOIN ay_list ay
    CROSS JOIN generate_series(1, 167) i
),
mhs_users AS (
    INSERT INTO users (email, password_hash, full_name, role_id, is_active)
    SELECT email, password_hash, full_name, role_id, true
    FROM mhs_data
    ON CONFLICT (email) DO NOTHING
    RETURNING id, email
)
INSERT INTO students (user_id, nim, prodi_id, academic_year_id, entry_type, entry_test_score, is_active, status)
SELECT mu.id, md.nim, md.prodi_id, md.academic_year_id, md.entry_type, md.entry_test_score, true, 'aktif'
FROM mhs_users mu
JOIN mhs_data md ON mu.email = md.email
ON CONFLICT DO NOTHING;