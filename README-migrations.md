# ===== Migrasi Database (node-pg-migrate — DL-15) =====

Nama file migrasi: `V{YYYYMMDD}_{sequence}__{deskripsi}.sql` (contoh: `V20260801_001__create_roles.sql`).
Dijalankan terpisah dari kode aplikasi (service `migrate` di Docker Compose production — K-01).

Perintah (dari `backend/`):

```bash
npm run migrate:up      # jalankan semua migrasi pending
npm run migrate:down    # rollback migrasi terakhir
npm run migrate:create -- <nama>   # buat file migrasi baru
```

Migrasi pertama (T1.2) akan membuat seluruh schema sesuai docs/02 §4.2–4.3:
roles, users, faculties, prodis, academic_years, courses, curricula, classes, schedules,
students, lecturers, krs_submissions, krs_items, grades, payments, payment_items,
attendance_sessions, attendance_records, guidance_sessions, substitute_teaching,
payrolls, audit_logs, notifications, krs_periods

- constraint unik kuota KRS (AC-02, AC-07) + seed base (roles, fakultas, prodi, academic_years).
