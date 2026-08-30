-- V20260815_018__create_announcements.sql
-- Announcements (Informasi Penting) - admin_sistem bisa input, tampil di dashboard mahasiswa/dosen

CREATE TABLE announcements (
    id              BIGSERIAL PRIMARY KEY,
    title           VARCHAR(200) NOT NULL,
    message         TEXT NOT NULL,
    target_roles    VARCHAR(100)[],  -- array of role codes: 'mahasiswa', 'dosen', 'admin_akademik', etc. Empty = all
    priority        SMALLINT NOT NULL DEFAULT 0,  -- higher = more important, shown first
    is_active       BOOLEAN NOT NULL DEFAULT true,
    published_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_by      BIGINT NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_active ON announcements(is_active);
CREATE INDEX idx_announcements_published ON announcements(published_at);
CREATE INDEX idx_announcements_expires ON announcements(expires_at);
CREATE INDEX idx_announcements_priority ON announcements(priority DESC);