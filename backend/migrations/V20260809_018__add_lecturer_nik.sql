-- Migration: add lecturer NIK (legacy 20260809018, penamaan tanpa prefix V)
-- Struktur sudah ada di DB produksi (kolom nik lecturers) — dibuat idempotent
-- supaya bisa direkam/diulang aman.

ALTER TABLE lecturers ADD COLUMN IF NOT EXISTS nik VARCHAR(20) UNIQUE;
