-- Migration: Add attendance.recap permission for dosen role
--
-- Sistem ini pakai code-first RBAC (src/lib/policy.ts = SSOT), jadi tidak ada
-- tabel permissions/role_permissions di DB. Permission `attendance.recap` sudah
-- ditambahkan ke policy.ts (PERMISSIONS + ROLE_PERMISSIONS.dosen).
--
-- Migration ini hanya placeholder idempotent supaya pgmigrations tercatat dan
-- urutan migration tetap konsisten antar environment. Tidak ada perubahan skema.

SELECT 1;
