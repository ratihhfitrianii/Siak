-- Keluhan lama (docs/list perbaikan.txt): "user mahasiswa dan dosen masuk menggunakan username NIM/NIK"
-- Mahasiswa sudah punya students.nim; dosen sekarang dapat kolom NIK (login identifier selain NIDN/email).
ALTER TABLE lecturers ADD COLUMN nik VARCHAR(20) UNIQUE;
