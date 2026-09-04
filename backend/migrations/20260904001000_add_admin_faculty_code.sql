-- Admin akademik terikat ke 1 fakultas (max 3 per fakultas).
-- Kolom nullable; diisi hanya untuk role admin_akademik.
ALTER TABLE users
  ADD COLUMN admin_faculty_code VARCHAR(10) REFERENCES faculties(code);
