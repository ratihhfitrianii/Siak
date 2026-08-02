-- Fix seed email mahasiswa (T1.2 open item): local part berisi '/' (akademik year '2023/2024')
-- membuat email INVALID per RFC 5322 dan selalu ditolak validasi zod (loginSchema) —
-- akibatnya seluruh akun mahasiswa seed tidak bisa login.
-- Fix: buang '/' dari local part: mhs.AKT_2023/2024_1@siak.local → mhs.AKT_20232024_1@siak.local
-- Berlaku untuk DB yang sudah dimigrasi (dev) maupun fresh install (menjalankan V005 lama).

UPDATE users
SET email = regexp_replace(email, '/', '', 'g'),
    updated_at = now()
WHERE email LIKE '%/%'
  AND email LIKE '%@siak.local';
