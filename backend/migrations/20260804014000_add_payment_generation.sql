-- V20260804_014__add_payment_generation.sql
-- Functions & triggers for automatic payment generation

-- Function to get SPP amount based on semester code
CREATE OR REPLACE FUNCTION get_spp_amount(semester_code TEXT)
RETURNS NUMERIC(14,2) AS $$
BEGIN
    IF semester_code LIKE '%-1' THEN
        RETURN 970000; -- Ganjil
    ELSE
        RETURN 950000; -- Genap
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to generate payments for a semester
CREATE OR REPLACE FUNCTION generate_payments_for_semester(p_semester_id SMALLINT)
RETURNS VOID AS $$
DECLARE
    v_semester RECORD;
    v_student RECORD;
    v_spp_amount NUMERIC(14,2);
    v_total_amount NUMERIC(14,2);
    v_due_date DATE;
    v_payment_id BIGINT;
    v_is_new_student BOOLEAN;
BEGIN
    -- Get semester info
    SELECT s.*, ay.code as academic_year_code
    INTO v_semester
    FROM semesters s
    JOIN academic_years ay ON ay.id = s.academic_year_id
    WHERE s.id = p_semester_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Semester % not found', p_semester_id;
    END IF;

    -- Get SPP base amount
    v_spp_amount := get_spp_amount(v_semester.code);

    -- Due date: 1 week before KRS end date (or semester end if no KRS period)
    SELECT COALESCE(
        (SELECT kp.end_date FROM krs_periods kp WHERE kp.semester_id = v_semester.id AND kp.is_active ORDER BY kp.end_date LIMIT 1),
        v_semester.end_date
    ) - INTERVAL '7 days' INTO v_due_date;

    -- Loop through ALL active students (regardless of academic_year_id)
    FOR v_student IN
        SELECT s.*, u.email
        FROM students s
        JOIN users u ON u.id = s.user_id
        WHERE s.is_active = true
    LOOP
        -- Check if payment already exists
        IF EXISTS (SELECT 1 FROM payments WHERE student_id = v_student.id AND semester_id = v_semester.id) THEN
            CONTINUE;
        END IF;

        -- Determine if new student (angkatan = current semester's academic year)
        v_is_new_student := (v_student.academic_year_id = v_semester.academic_year_id);

        -- Calculate total amount
        v_total_amount := v_spp_amount;
        IF v_is_new_student THEN
            -- New students: add gedung + tes
            v_total_amount := v_total_amount + 200000 + 50000; -- Gedung 200k, Tes 50k
        END IF;

        -- Insert payment
        INSERT INTO payments (student_id, semester_id, total_amount, paid_amount, status, due_date)
        VALUES (v_student.id, v_semester.id, v_total_amount, 0, 'belum_lunas', v_due_date)
        RETURNING id INTO v_payment_id;

        -- Insert payment items
        INSERT INTO payment_items (payment_id, type, description, amount, is_mandatory)
        VALUES (v_payment_id, 'SPP', 'SPP Semester ' || v_semester.name, v_spp_amount, true);

        IF v_is_new_student THEN
            INSERT INTO payment_items (payment_id, type, description, amount, is_mandatory)
            VALUES (v_payment_id, 'Gedung', 'Biaya Gedung Mahasiswa Baru', 200000, true);

            INSERT INTO payment_items (payment_id, type, description, amount, is_mandatory)
            VALUES (v_payment_id, 'Tes', 'Biaya Tes Masuk', 50000, true);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Trigger: auto-generate payments when new semester is activated
CREATE OR REPLACE FUNCTION trigger_generate_payments()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = true AND OLD.is_active = false THEN
        PERFORM generate_payments_for_semester(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_payments ON semesters;
CREATE TRIGGER trg_generate_payments
    AFTER UPDATE OF is_active ON semesters
    FOR EACH ROW
    EXECUTE FUNCTION trigger_generate_payments();

-- Function: update payment status (manual by admin keuangan)
CREATE OR REPLACE FUNCTION update_payment_status(
    p_payment_id BIGINT,
    p_paid_amount NUMERIC(14,2),
    p_admin_id BIGINT
)
RETURNS VOID AS $$
DECLARE
    v_payment RECORD;
    v_new_status VARCHAR(20);
BEGIN
    SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment % not found', p_payment_id;
    END IF;

    IF p_paid_amount < 0 OR p_paid_amount > v_payment.total_amount THEN
        RAISE EXCEPTION 'Invalid paid amount';
    END IF;

    IF p_paid_amount = 0 THEN
        v_new_status := 'belum_lunas';
    ELSIF p_paid_amount >= v_payment.total_amount THEN
        v_new_status := 'lunas';
    ELSE
        v_new_status := 'partial';
    END IF;

    UPDATE payments
    SET paid_amount = p_paid_amount,
        status = v_new_status,
        updated_at = now()
    WHERE id = p_payment_id;

    -- Audit log
    INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, changed_by, changed_by_label, ip_address)
    VALUES (
        'payments', p_payment_id, 'UPDATE',
        jsonb_build_object('paid_amount', v_payment.paid_amount, 'status', v_payment.status),
        jsonb_build_object('paid_amount', p_paid_amount, 'status', v_new_status),
        p_admin_id,
        (SELECT full_name || ' (' || r.code || ')' FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = p_admin_id),
        NULL
    );
END;
$$ LANGUAGE plpgsql;

-- Function: check if student can access KRS (full payment required)
CREATE OR REPLACE FUNCTION can_access_krs(p_student_id BIGINT, p_semester_id SMALLINT)
RETURNS BOOLEAN AS $$
DECLARE
    v_status VARCHAR(20);
BEGIN
    SELECT status INTO v_status
    FROM payments
    WHERE student_id = p_student_id AND semester_id = p_semester_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN v_status = 'lunas';
END;
$$ LANGUAGE plpgsql;