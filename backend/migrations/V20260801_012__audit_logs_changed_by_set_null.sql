-- V012: audit_logs.changed_by — ON DELETE SET NULL.
-- Saat user dihapus (Admin Sistem), jejak audit TETAP ada; changed_by jadi NULL.
-- (Audit trail append-only per S-06 — jangan CASCADE/hapus baris audit.)
ALTER TABLE audit_logs
    ALTER COLUMN changed_by DROP NOT NULL;

ALTER TABLE audit_logs
    DROP CONSTRAINT audit_logs_changed_by_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL;
