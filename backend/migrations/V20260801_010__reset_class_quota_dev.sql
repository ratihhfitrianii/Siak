-- Reset kuota kelas seed dev (T1.6): V006 mengisi current_enrolled 28–30 (kapasitas 30),
-- nyaris penuh sehingga test KRS (submit 2+ kelas) selalu kena CLASS_FULL. Dev-only —
-- kelas seed direset ke 0 supaya deterministik; test suite men-decrement sendiri via cleanup.
UPDATE classes
SET current_enrolled = 0, updated_at = now()
WHERE id IN (SELECT id FROM classes ORDER BY id);
