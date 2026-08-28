-- Perbaikan bug: KRS diblokir walau semua pembayaran lunas.
-- Penyebab: can_access_krs() mengembalikan false (blokir) saat TIDAK ADA baris tagihan
-- (payments) untuk semester KRS aktif — karena tagihan semester baru belum digenerate.
-- Kebijakan baru (keputusan user 2026-08-28): tidak ada tagihan = BOLEH akses KRS.
-- Blokir HANYA jika ada tagihan yang statusnya belum 'lunas'.
CREATE OR REPLACE FUNCTION can_access_krs(p_student_id BIGINT, p_semester_id SMALLINT)
RETURNS BOOLEAN AS $$
DECLARE
    v_status VARCHAR(20);
    v_count INTEGER;
BEGIN
    -- Hitung jumlah tagihan untuk semester ini
    SELECT COUNT(*) INTO v_count
    FROM payments
    WHERE student_id = p_student_id AND semester_id = p_semester_id;

    -- Tidak ada tagihan sama sekali → tidak ada tunggakan → boleh akses
    IF v_count = 0 THEN
        RETURN true;
    END IF;

    -- Ambil status; jika ada SATU pun tagihan yang belum lunas → blokir
    SELECT status INTO v_status
    FROM payments
    WHERE student_id = p_student_id AND semester_id = p_semester_id
    LIMIT 1;

    RETURN v_status = 'lunas';
END;
$$ LANGUAGE plpgsql;
