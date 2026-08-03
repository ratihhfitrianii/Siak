-- V012 down: kembalikan NOT NULL + FK CASCADE-ditolak (constraint asli tanpa ON DELETE).
ALTER TABLE audit_logs
    DROP CONSTRAINT audit_logs_changed_by_fkey;

ALTER TABLE audit_logs
    ADD CONSTRAINT audit_logs_changed_by_fkey
    FOREIGN KEY (changed_by) REFERENCES users(id);

ALTER TABLE audit_logs
    ALTER COLUMN changed_by SET NOT NULL;
