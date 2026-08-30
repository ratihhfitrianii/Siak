-- T2.5 — Notifikasi: kolom status delivery + retry (AC-04d, docs/02 §modul notifikasi)
-- Menambah kemampuan antrean pengiriman: PENDING → SENT / FAILED, attempts untuk retry,
-- sent_at untuk audit. In-app lama (sudah tersimpan) di-backfill sebagai SENT.

ALTER TABLE notifications
    ADD COLUMN status        VARCHAR(20) NOT NULL DEFAULT 'PENDING',  -- PENDING | SENT | FAILED
    ADD COLUMN sent_at       TIMESTAMPTZ,
    ADD COLUMN attempts      SMALLINT    NOT NULL DEFAULT 0,
    ADD COLUMN last_error    TEXT;

-- Notifikasi in-app yang sudah ada (sent_via hanya in_app) = sudah terkirim.
UPDATE notifications
SET status = 'SENT', sent_at = COALESCE(sent_at, created_at)
WHERE status = 'PENDING' AND NOT ('email' = ANY(sent_via));

-- Antrean delivery diproses per status; index untuk scan PENDING yang efisien.
CREATE INDEX idx_notifications_status ON notifications(status, id);
