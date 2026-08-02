-- Fix seed password (T1.2 open item): hash seed `$2b$12$LQv...` tidak cocok dengan
-- password terdokumentasi (typo saat generate), sehingga akun seed tidak bisa login.
-- Berlaku untuk DB yang sudah dimigrasi (dev); fresh install sudah benar via V004/V005.
-- Password dev terdokumentasi:
--   admin_*       → Admin123!
--   dosen.*       → Dosen123!
--   mhs.*         → Mhs123!

UPDATE users u
SET password_hash = '$2b$12$8HU58T/7ACy5X9z2WhzQveyfvkvbEEhJOlB8Mz.xpyvTdUMMsVKCa',  -- Admin123!
    updated_at = now()
WHERE u.email LIKE '%@siak.local'
  AND u.email NOT LIKE 'dosen.%'
  AND u.email NOT LIKE 'mhs.%'
  AND u.role_id IN (SELECT id FROM roles WHERE code LIKE 'admin_%');

UPDATE users u
SET password_hash = '$2b$12$fyQeFJg/KUQch2k9qB1iv.y/Z5wmz9rmKWSGBbsJiyYi2lIZq.ZZm',  -- Dosen123!
    updated_at = now()
WHERE u.email LIKE 'dosen.%@siak.local';

UPDATE users u
SET password_hash = '$2b$12$YeUWmg0YaKQcUXlspGqbB.Iucw6CIR8i79cktdIRsQoSOod6QRepm',  -- Mhs123!
    updated_at = now()
WHERE u.email LIKE 'mhs.%@siak.local';
