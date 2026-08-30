ALTER TABLE students ADD COLUMN domicile_address TEXT;

COMMENT ON COLUMN students.domicile_address IS 'Alamat domisili mahasiswa';
