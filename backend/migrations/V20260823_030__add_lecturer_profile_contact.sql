-- Menambahkan kolom kontak & foto profil pada tabel lecturers (untuk halaman Profile dosen)
ALTER TABLE lecturers
    ADD COLUMN IF NOT EXISTS phone          VARCHAR(20),
    ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255),
    ADD COLUMN IF NOT EXISTS photo_url      TEXT;