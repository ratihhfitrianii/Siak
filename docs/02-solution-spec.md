# Solution Specification — Siak (Sistem Informasi Akademik)
|
> **Status:** ✅ **APPROVED** (2026-08-01, Tugas #2) — siap untuk implementasi Developer
> **Tanggal:** 2026-07-31 (refine: 2026-08-01)
> **Persona:** Analyst
> **Input:** `docs/00-project-brief.md`, `docs/01-requirements.md` (APPROVED), `docs/decision-log.md`
> **Runtime terverifikasi (2026-08-01):** Node.js 22.15.0, Python 3.11.15, .NET 9.0.200, Go 1.22.5, Git 2.48.1. **Tidak tersedia:** Java, PHP.

---

## 1. Ringkasan Eksekutif

Siak adalah platform Sistem Informasi Akademik untuk kampus nyata (±2.000 mahasiswa, ±100 dosen, puncak ±5.000 simultan saat hari pertama KRS). Spesifikasi ini menerjemahkan requirements yang sudah APPROVED menjadi desain implementasi:

- **Arsitektur:** monolith modular (Node.js/TypeScript) + PostgreSQL + Redis + Socket.io, deployment-ready di VPS/cloud (Docker).
- **Prinsip utama:** RBAC sebagai satu-satunya sumber kebenaran akses; integritas kuota kelas via transaksi ACID + locking; audit trail & atribusi "diinput oleh X" built-in; error inline; waiting room Redis+WebSocket dengan fallback polling.
- **Keputusan kunci** (lengkap di `docs/decision-log.md`): stack Node.js/Express, React/Vite/Tailwind, PostgreSQL 16, Redis 7, ambang waiting room default 5.000 (configurable, dituning lewat load test — DL-11).

## 2. Arsitektur Sistem

### 2.1 Prinsip Arsitektur

| # | Prinsip | Alasan |
|---|---------|--------|
| A-1 | **Monolith modular** (bukan microservices) | Tim 1 developer; domain terpisah per modul (folder/service) tetapi satu deployable — mengurangi kompleksitas operasional, tetap memungkinkan pemisahan nanti |
| A-2 | **Stateless backend** (JWT + session di Redis) | Horizontal scaling & load balancer tanpa sticky session (NF-04) |
| A-3 | **Single source of truth RBAC** | Middleware `authorize()` + policy service; di-enforce di backend, UI hanya cermin (AC-10) |
| A-4 | **Audit & atribusi built-in** | Setiap mutasi data melewati audit service (S-06, S-07); tidak bisa dilewati |
| A-5 | **Integritas kuota via DB** | KRS submit memakai transaksi ACID + `SELECT ... FOR UPDATE` (F-07, AC-02) |
| A-6 | **Adapter untuk integrasi eksternal** | Payment gateway & PDDikti lewat interface; mock dulu, real nanti (K-03) |
| A-7 | **Deployment-ready** | Docker, env vars, health check, graceful shutdown, migrasi DB terpisah dari kode (K-01, K-02) |
| A-8 | **Error inline & konsisten** | Taksonomi error API + komponen UI error inline (AC-09) |

### 2.2 High-Level Architecture

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        Web["Web Browser (React SPA)"]
        Mobile["Mobile Browser (Responsive)"]
    end

    subgraph Edge["Edge Layer (Nginx)"]
        LB["Load Balancer\n+ SSL Termination\n+ Rate Limit (IP)"]
        WR["Waiting Room Check\n(Redis active_users_count)\nAmbang: configurable, default 5.000"]
    end

    subgraph Backend["Backend (Node.js 22 + TypeScript + Express) — monolith modular"]
        Auth["Modul Auth\nJWT access+refresh, bcrypt"]
        Rbac["Modul User & RBAC\n5 tipe akun + atribut Wali"]
        Krs["Modul KRS\nPeriode, kuota locking, validasi"]
        Acad["Modul Akademik\nKurikulum, kelas, jadwal, nilai, transkrip"]
        Fin["Modul Keuangan\nTagihan, pembayaran, payroll"]
        Dosen["Modul Dosen\nPilih MK, absensi, bimbingan, substitute"]
        Audit["Modul Audit\nAudit trail + atribusi"]
        Notif["Modul Notifikasi\nScheduler + in-app + email (plugin)"]
        Import["Modul Impor\nExcel/CSV upsert"]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL 16\nPrimary + Replica read)]
        Redis[(Redis 7\nCache + Queue + Session + Counter)]
        WS["Socket.io Server\n(Waiting room + notif real-time)"]
    end

    Client --> LB
    LB --> WR
    WR --> Backend
    Backend --> PG
    Backend --> Redis
    Backend --> WS
    Notif --> WS
```

### 2.3 Komponen & Tanggung Jawab

| Komponen | Tanggung Jawab | Requirement |
|----------|----------------|-------------|
| **Nginx (Edge)** | Load balancer, SSL termination, rate limit per IP, serve static frontend, proxy WebSocket | NF-04, S-04 |
| **Waiting Room (Edge + Redis)** | Cek `active_users_count`; antrekan via Redis queue; beri Virtual Token + UI ruang tunggu; instruksi masuk via WebSocket/polling saat slot kosong | F-17, NF-05, K-09 |
| **Modul Auth** | Login/logout/refresh; hashing bcrypt; JWT access (15 mnt) + refresh (7 hari, HttpOnly); rate limit login | F-01, F-02, F-04, S-01, S-02 |
| **Modul User & RBAC** | CRUD user & peran; atribut Wali; policy service (authorize + ownership + scope binaan) | F-09, S-05, AC-10 |
| **Modul KRS** | Periode KRS; daftar kelas tersedia (kuota>0); submit dengan transaksi + locking; status (draft/submitted/approved/rejected); gate lunas; validasi admin; revisi; kunci setelah submit | F-07, F-07a, F-11, F-14, F-15, AC-02~AC-04c, AC-07 |
| **Modul Akademik** | Fakultas/prodi/angkatan; kurikulum; buka/tutup MK; kelas & jadwal; input nilai (20/30/50, remedial, skala A–E); transkrip & IPK (PDF/Excel); matkul diulang → nilai lama digantikan | F-05, F-06, F-06a~c, F-07b~d, F-10, F-16, F-22 |
| **Modul Keuangan** | Generate tagihan otomatis per semester; nominal per angkatan; update status manual (partial/lunas); histori; payroll (input admin keuangan, visibilitas terbatas) | F-08, F-08a~f, F-12, F-19, F-26 |
| **Modul Dosen** | Pilih MK (filter prodi); ketersediaan jadwal (checklist); absensi (wajib materi); bimbingan (wali); substitute teaching | F-20, F-21, F-23, F-24, F-25 |
| **Modul Audit** | Catat semua mutasi: user, waktu, aksi, entity, nilai lama/baru, label atribusi | F-13, S-06, S-07, AC-05 |
| **Modul Notifikasi** | Scheduler cek mahasiswa belum isi KRS; kirim notif via plugin (default email + in-app; WA/Telegram nanti); notif substitute | AC-04d, F-25, K-09 |
| **Modul Impor** | Upload Excel/CSV; validasi schema; upsert NIM/NIK; laporan hasil | F-18, K-08 |

### 2.4 Workflow Utama

**KRS Flow (end-to-end):**

```mermaid
sequenceDiagram
    participant M as Mahasiswa
    participant LB as Nginx/LB
    participant WR as Waiting Room
    participant API as Backend API
    participant DB as PostgreSQL
    participant R as Redis
    participant WS as Socket.io

    M->>LB: GET /api/v1/krs/available-classes
    LB->>WR: Cek active_users_count
    alt count < WAITING_ROOM_THRESHOLD (default 5000)
        WR->>API: Forward request
    else count >= threshold
        WR->>R: LPUSH waiting_queue (Virtual Token)
        WR-->>M: 429 + token + UI Ruang Tunggu
        WS-->>M: Push "enter_now" saat slot kosong (fallback polling 30s)
    end
    API->>DB: Cek SPP lunas penuh (F-15, AC-03)
    API->>DB: BEGIN; SELECT ... FOR UPDATE kelas (kuota)
    API->>DB: Hitung terisi; INSERT krs_items; COMMIT
    API-->>M: KRS tersimpan (status DRAFT)
    M->>API: POST /krs/submit → status SUBMITTED (terkunci, AC-07)
    API->>DB: UPDATE krs_submissions SET status='SUBMITTED'
    API-->>M: KRS submitted
```

**Alur Input Nilai (F-10, F-06a):**

```mermaid
sequenceDiagram
    participant D as Dosen
    participant API as Backend API
    participant DB as PostgreSQL
    participant A as Audit Service

    D->>API: POST /grades (tugas, uts, uas)
    API->>DB: Simpan komponen + hitung akhir (20/30/50)
    API->>DB: Remedial? ambil max(nilai asli, remedial) per komponen
    API->>DB: Map ke huruf (A=4.0 ... E=0)
    API->>A: Log mutasi + atribusi "diinput oleh Dosen X"
    API-->>D: Tersimpan
    Note over API,M: Nilai langsung tampil di mahasiswa (tanpa gate approval)
```

**Alur Absensi (F-23):**

```mermaid
sequenceDiagram
    participant D as Dosen
    participant API as Backend API

    D->>API: POST /attendance/sessions (wajib topic + material)
    API-->>D: Sesi dibuat; daftar mahasiswa aktif muncul
    D->>API: POST /attendance/sessions/:id/records (Hadir/Tidak Hadir)
    API-->>D: Tersimpan + audit
```

**Alur Substitute Teaching (F-25):**

```mermaid
sequenceDiagram
    participant P as Dosen/Admin Akademik
    participant API as Backend API
    participant WS as Socket.io

    P->>API: POST /substitute (original, pengganti, kelas, tanggal)
    API->>API: Langsung ACTIVE tanpa approval (hari H)
    API->>WS: Notif ke mahasiswa kelas + dosen pengganti
    API-->>P: Aktif; dosen pengganti dapat akses halaman dosen yang diganti
```

## 3. Pemilihan Teknologi Stack

### 3.1 Keputusan (detail & alternatif: `docs/decision-log.md` DL-02 s.d. DL-07)

| Layer | Teknologi | Justifikasi dari Requirements |
|-------|-----------|------------------------------|
| **Backend** | **Node.js 22 + TypeScript + Express** | Runtime tersedia (terverifikasi 22.15.0); event loop cocok untuk I/O tinggi (5k simultan); TypeScript → kode bersih (K-06); ekosistem middleware (rate limit, JWT, multer) mempercepat RBAC & audit; satu bahasa dengan frontend (TypeScript) mengurangi konteks switching |
| **Frontend** | **React 18 + TypeScript + Vite + Tailwind CSS** | Responsive (NF-01); Vite fast HMR; Tailwind untuk UI estetik & konsisten (AC-09 error inline, AC-10 RBAC UI); React Query untuk caching server state |
| **Database** | **PostgreSQL 16** | ACID transaksi untuk KRS locking (F-07, AC-02); JSONB untuk audit trail (S-06); partial unique index untuk aturan "satu submission aktif per mahasiswa per semester"; mature untuk 5k simultan; row-level security opsional (S-05) |
| **Cache/Queue/Session** | **Redis 7** | Waiting room counter + queue (F-17, NF-05); caching kurikulum/kelas/transkrip (NF-02); session store backend stateless (NF-04) |
| **Real-time** | **Socket.io** | Waiting room notifikasi (F-17); notif substitute & KRS (F-25, AC-04d); **fallback polling 30s** jika WebSocket gagal (K-09) |
| **Auth** | **JWT (access+refresh) + bcrypt** | Stateless untuk load balancer (NF-04); session timeout 15 menit (S-02); rotasi refresh token |
| **Validasi** | **Zod** | Schema validation di tiap endpoint → error inline (AC-09); mencegah input invalid |
| **ORM/Migrasi** | **Prisma + node-pg-migrate** (migrasi SQL file) | Prisma = prepared statements (F-03, S-03); migrasi SQL eksplisit up/down terpisah dari kode (K-01) |
| **Import** | **csv-parse / xlsx** | Impor Excel/CSV streaming (F-18) |
| **Export** | **pdfmake / exceljs** | Transkrip PDF/Excel (F-16, AC-06) |
| **Test** | **Jest (unit) + Testcontainers (integrasi) + k6 (load) + Playwright (E2E)** | Quality gate ≥80% (K-06); load 5k (AC-01); E2E critical path (T5.7) |
| **CI/CD** | **GitHub Actions** | Lint/typecheck/test/build gate sebelum merge (K-06); deploy staging otomatis; production manual trigger |
| **Deployment** | **Docker + Docker Compose + Nginx** | VPS/cloud-ready (K-01, K-02); env vars; health check; graceful shutdown |
| **Monitoring** | **Prometheus + Grafana + Loki** | Metrics 5k simultan, alerting, log terpusat (NF-06, AC-01) |

### 3.2 Mengapa Bukan Alternatif (ringkas)

| Alternatif | Alasan ditolak |
|------------|----------------|
| **Python (FastAPI/Django)** | Runtime tersedia; cocok, tetapi ekosistem real-time (Socket.io) dan satu-bahasa-dengan-frontend lebih kuat di Node; tim user sudah berorientasi JS/TS |
| **Go (Gin/Echo)** | Runtime tersedia; performa sangat baik, tetapi produktivitas CRUD-heavy + ORM/ekosistem admin lebih lambat untuk 1 developer; tanpa keuntungan signifikan di skala 5k |
| **.NET 9** | Runtime tersedia; solid, tetapi toolchain lebih berat dan ekosistem UI/real-time kurang lincah untuk kebutuhan ini; biaya mental model lebih tinggi |
| **Java/PHP** | **Tidak tersedia** di environment (K-05 pada daftar constraint pipeline) |
| **MySQL** | Transaksi & partial unique index ada, tetapi JSONB, row-level security, dan tooling analitik PostgreSQL lebih unggul untuk audit & RBAC |
| **Microservices** | Over-engineering untuk 1 developer & 5k pengguna; monolith modular dipilih (DL-07) |

## 4. Desain Data

### 4.1 ERD

```mermaid
erDiagram
    ROLE ||--o{ USER : has
    USER ||--o{ AUDIT_LOG : writes
    FACULTY ||--o{ PRODI : has
    PRODI ||--o{ CURRICULUM : defines
    PRODI ||--o{ STUDENT : enrolls
    PRODI ||--o{ LECTURER : employs
    COURSE ||--o{ CURRICULUM : listed_in
    COURSE ||--o{ CLASS : offered_as
    LECTURER ||--o{ CLASS : teaches
    CLASS ||--o{ SCHEDULE : has
    ACADEMIC_YEAR ||--o{ CLASS : for_period
    STUDENT ||--o{ KRS_SUBMISSION : submits
    KRS_SUBMISSION ||--o{ KRS_ITEM : contains
    KRS_ITEM }|--|| CLASS : references
    CLASS ||--o{ GRADE : has
    GRADE }|--o{ STUDENT : for
    STUDENT ||--o{ PAYMENT : has
    PAYMENT ||--o{ PAYMENT_ITEM : details
    LECTURER ||--o{ GUIDANCE_SESSION : guides
    STUDENT ||--o{ GUIDANCE_SESSION : receives
    CLASS ||--o{ ATTENDANCE_SESSION : has
    ATTENDANCE_SESSION ||--o{ ATTENDANCE_RECORD : contains
    STUDENT ||--o{ ATTENDANCE_RECORD : has
    LECTURER ||--o{ SUBSTITUTE_TEACHING : substituted_by
    LECTURER ||--o{ PAYROLL : paid
```

### 4.2 Tabel Utama & Kolom Kunci

| Tabel | Kolom Kunci | Catatan |
|-------|-------------|---------|
| `roles` | id (PK), code (UNIQUE), name | 1=MAHASISWA, 2=DOSEN, 3=ADMIN_AKADEMIK, 4=ADMIN_KEUANGAN, 5=ADMIN_SISTEM |
| `users` | id (PK), username (UNIQUE), password_hash, role_id (FK), **is_wali (boolean)**, student_id (FK, nullable), lecturer_id (FK, nullable), is_active, created_at | **Atribut Wali ada di akun** (Confirmed Fact #16); is_wali hanya bermakna untuk role DOSEN |
| `faculties` | id, code (UNIQUE), name | |
| `prodis` | id, code (UNIQUE), name, faculty_id (FK) | |
| `academic_years` | id, year, semester (GANJIL/GENAP), is_active | Satu aktif per waktu |
| `courses` | id, code (UNIQUE), name, sks | |
| `curricula` | id, prodi_id (FK), course_id (FK), semester_number, is_elective | Kurikulum per prodi per semester (F-07c) |
| `classes` | id, course_id (FK), academic_year_id (FK), lecturer_id (FK), class_code (A/B/C), quota (default 30) | Kelas = matkul + dosen + jadwal (F-22); kuota ±30 (F-07d) |
| `schedules` | id, class_id (FK), day, start_time, end_time, room | Diinput Admin Akademik (F-21) |
| `students` | id, nim (UNIQUE), full_name, prodi_id (FK), academic_year_id (FK) = angkatan, contact_json | NIM dari sistem lain (K-08) |
| `lecturers` | id, nik (UNIQUE), full_name, prodi_id (FK) | is_wali TIDAK di sini — ada di `users` |
| `krs_submissions` | id, student_id (FK), academic_year_id (FK), status (DRAFT/SUBMITTED/APPROVED/REJECTED), submitted_at, approved_by, approved_at, reject_reason | Satu submission aktif per mahasiswa per semester (partial unique index) |
| `krs_items` | id, krs_submission_id (FK), class_id (FK), **student_id (FK, denormalized)** | UNIQUE (class_id, student_id) → anti duplikat kelas di DB level (AC-02) |
| `grades` | id, class_id (FK), student_id (FK), tugas, uts, uas, remedial_tugas, remedial_uts, remedial_uas, final_score, grade_letter, input_by (FK users), updated_at | Bobot 20/30/50; final = max(asli, remedial); **tanpa kolom is_validated** (nilai langsung tampil, F-10) |
| `payments` | id, student_id (FK), academic_year_id (FK), total_amount, paid_amount, status (UNPAID/PARTIAL/PAID), due_date | 1 tagihan/semester (F-08a) |
| `payment_items` | id, payment_id (FK), description, amount | Rincian biaya (SPP, tes, gedung) — mahasiswa baru beda (F-08d) |
| `attendance_sessions` | id, class_id (FK), lecturer_id (FK), meeting_number, topic, material, session_date | Wajib topic+material sebelum absensi (F-23) |
| `attendance_records` | id, session_id (FK), student_id (FK), status (HADIR/TIDAK_HADIR), input_by | |
| `guidance_sessions` | id, lecturer_id (FK), student_id (FK), meeting_date, progress_notes, input_by | Hanya dosen berstatus Wali (F-24) |
| `substitute_teaching` | id, original_lecturer_id (FK), substitute_lecturer_id (FK), class_id (FK), session_date, status (ACTIVE), requested_by, requested_at | Langsung aktif tanpa approval (F-25) |
| `payrolls` | id, lecturer_id (FK), academic_year_id (FK), month, base_amount, adjustment, total, status, input_by, input_at | Visibilitas: dosen bersangkutan + admin keuangan (F-26) |
| `audit_logs` | id, user_id (FK), action, entity_type, entity_id, old_value_json, new_value_json, input_by_label, created_at | Atribusi "diinput oleh X" (S-07) |
| `notifications` | id, user_id (FK), channel, title, body, status (PENDING/SENT/FAILED), sent_at | Antrean notifikasi (AC-04d) |
| `krs_periods` | id, academic_year_id (FK), name, opens_at, closes_at, spp_deadline | Periode KRS + batas lunas 1 minggu sebelum tutup (F-07a, F-08b) |

### 4.3 Indeks & Constraint Penting

```sql
-- Satu submission aktif per mahasiswa per semester (AC-07, F-14)
CREATE UNIQUE INDEX uq_krs_submission_active
  ON krs_submissions (student_id, academic_year_id)
  WHERE status IN ('DRAFT', 'SUBMITTED', 'APPROVED');

-- Anti duplikat kelas per mahasiswa (AC-02) — student_id denormalized
CREATE UNIQUE INDEX uq_krs_item_student_class ON krs_items (class_id, student_id);

-- Query kelas tersedia (kuota > terisi)
CREATE INDEX idx_krs_items_class ON krs_items (class_id);
CREATE INDEX idx_krs_submissions_status ON krs_submissions (status);

-- Nilai & transkrip
CREATE INDEX idx_grades_class_student ON grades (class_id, student_id);
CREATE INDEX idx_grades_student_year ON grades (student_id, academic_year_id);

-- Pembayaran & gate KRS
CREATE INDEX idx_payments_student_year ON payments (student_id, academic_year_id);

-- Audit trail
CREATE INDEX idx_audit_user_time ON audit_logs (user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs (entity_type, entity_id);
```

> **Catatan kuota:** constraint `uq_krs_item_student_class` mencegah mahasiswa sama mengambil kelas sama dua kali, tetapi **bukan** pengganti cek kuota. Cek kuota dilakukan di aplikasi dalam transaksi: `SELECT ... FOR UPDATE` pada baris `classes`, hitung `COUNT(krs_items)` berstatus aktif (lewat submission SUBMITTED/APPROVED), tolak jika `terisi >= quota`. Ini menjamin AC-02 (tidak pernah melebihi kapasitas) di bawah konkurensi.

### 4.4 Migrasi & Seed

1. **Tools:** `node-pg-migrate` (SQL up/down eksplisit) di `backend/migrations/` — konsisten satu bahasa (Node), alternatif golang-migrate ditolak (DL-15).
2. **Naming:** `V{YYYYMMDD}_{sequence}__{description}.sql`
3. **Run:** terpisah dari kode — container migrasi dijalankan saat deploy sebelum backend start (K-01); health check DB ready → migrate → seed.
4. **Seed:** `seed_base.sql` (roles, fakultas, prodi, academic_years) + `seed_dev.sql` (data test ±2.000 mahasiswa, ±100 dosen).
5. **Upsert NIM existing:** `ON CONFLICT (nim) DO UPDATE SET ...` untuk impor mahasiswa baru (K-08).

## 5. API Contract

### 5.1 Konvensi

- **Base URL:** `/api/v1`
- **Auth:** `Authorization: Bearer <access_token>` (JWT 15 menit) + Refresh Token di HttpOnly cookie (7 hari, rotasi tiap refresh)
- **Rate limit:** login 5 req/menit/IP; API 100 req/menit/user; KRS submit 10 req/menit/user (burst protection) — via `express-rate-limit` + Redis store
- **Success envelope:**
```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 100 } }
```
- **Error envelope (AC-09):**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "Input tidak valid",
             "details": [{ "field": "nim", "message": "NIM sudah terdaftar" }] },
  "trace_id": "uuid"
}
```
- **Pagination/filter:** `page=1&limit=20&sort=created_at:desc&search=nim:2205`; cursor-based untuk list besar (audit_logs, krs_items)

### 5.2 Endpoint per Modul

| Modul | Endpoint | Role Akses | Catatan |
|-------|----------|------------|---------|
| **Auth** | `POST /auth/login` | Public | Return access + refresh cookie |
| | `POST /auth/refresh` | Public (cookie) | Rotasi refresh token |
| | `POST /auth/logout` | All | Hapus refresh token + DECR active_users_count |
| **User/RBAC** | `GET /users/me` | All | Profil login + menu yang diizinkan (RBAC UI) |
| | `PUT /users/me/contact` | Mahasiswa, Admin Sistem | Edit kontak (F-05) |
| | `GET /users` | Admin Sistem | List + filter role |
| | `POST /users` | Admin Sistem | Create user + role (default password sementara, wajib ganti) |
| | `PUT /users/:id/role` | Admin Sistem | Update role + is_wali |
| **KRS** | `GET /krs/period` | Mahasiswa, Admin | Info periode buka/tutup + spp_deadline |
| | `GET /krs/available-classes` | Mahasiswa | Hanya kelas kuota tersedia (F-07); cache 30s |
| | `POST /krs/draft` | Mahasiswa | Simpan draft (belum submit) |
| | `POST /krs/submit` | Mahasiswa | Locking DB + gate lunas (F-07, F-15); terkunci setelah submit (AC-07) |
| | `GET /krs/my` | Mahasiswa | Status + items |
| | `GET /krs/admin/pending` | Admin Akademik | List pending approval |
| | `POST /krs/admin/:id/approve` | Admin Akademik | Approve + notifikasi |
| | `POST /krs/admin/:id/reject` | Admin Akademik | Reject + alasan (AC-04c) |
| | `GET /krs/wali/classes` | Dosen (Wali) | Daftar mahasiswa di kelasnya (read-only, F-10) |
| **Akademik** | `GET /transcript?format=pdf\|xlsx` | Mahasiswa | Unduh transkrip (F-16, AC-06) |
| | `GET /grades/my` | Mahasiswa | Nilai per semester + IPK real-time (F-06) |
| | `POST /grades` | Dosen | Input tugas/uts/uas/remedial (F-10) |
| | `PUT /grades/:id` | Dosen (sendiri), Admin Akademik | Edit + atribusi "diinput oleh X" (S-07) |
| | `GET /curriculum/:prodiId` | Dosen, Admin Akademik | MK per semester |
| | `POST /curriculum/open` | Admin Akademik | Buka/tutup MK semester berjalan (F-07c) |
| | `POST /classes` | Admin Akademik | CRUD kelas + jadwal (F-07d, F-21) |
| **Keuangan** | `GET /payments/my` | Mahasiswa | Status + histori (F-08) |
| | `POST /payments/generate` | Admin Keuangan | Generate tagihan otomatis per semester (F-08a) |
| | `PUT /payments/:id/pay` | Admin Keuangan | Update status manual (F-12, F-19) |
| | `GET /payroll/my` | Dosen | Payroll sendiri (F-26) |
| | `POST /payroll` | Admin Keuangan | Input payroll dosen |
| **Dosen** | `POST /lecturer/course-selection` | Dosen | Pilih MK (filter prodi, F-20) |
| | `GET /lecturer/schedule-availability` | Dosen | Checklist jadwal dari admin (F-21) |
| | `PUT /lecturer/schedule-availability` | Dosen | Submit ketersediaan |
| | `GET /lecturer/classes` | Dosen | MK + jadwal + mahasiswa |
| | `POST /attendance/sessions` | Dosen | Buat sesi (wajib topic+material, F-23) |
| | `POST /attendance/sessions/:id/records` | Dosen | Absensi Hadir/Tidak Hadir |
| | `POST /guidance` | Dosen (Wali) | Catatan bimbingan (F-24) |
| | `GET /guidance` | Mahasiswa (sendiri), Dosen Wali (binaan) | Lihat bimbingan |
| | `POST /substitute` | Dosen, Admin Akademik | Langsung aktif tanpa approval (F-25) |
| **Import** | `POST /import/students` | Admin Sistem | Excel/CSV upsert NIM (F-18) |
| | `POST /import/lecturers` | Admin Sistem | Excel/CSV upsert NIK |
| | `POST /import/courses` | Admin Sistem | Excel/CSV |
| **Sistem** | `GET /health` | Public | Health check (DB + Redis) |
| | `GET /audit-logs` | Admin Akademik/Keuangan/Sistem | Audit trail + filter |

### 5.3 Contoh Request/Response Kunci

**Login** — `POST /api/v1/auth/login`
```json
// Request
{ "username": "22050001", "password": "***" }
// Response 200
{ "success": true, "data": { "accessToken": "***", "user": { "id": 1, "role": "MAHASISWA", "isWali": false } } }
// Response 429 (rate limit)
{ "success": false, "error": { "code": "RATE_LIMITED", "message": "Terlalu banyak percobaan. Coba lagi dalam 1 menit." }, "trace_id": "***" }
```

**Submit KRS** — `POST /api/v1/krs/submit`
```json
// Request
{ "classIds": [10, 23, 41] }
// Response 200
{ "success": true, "data": { "submissionId": 88, "status": "SUBMITTED", "locked": true } }
// Response 409 (kuota penuh — AC-02)
{ "success": false, "error": { "code": "CLASS_FULL", "message": "Kelas TI101-A sudah penuh.", "details": [{ "field": "classIds[1]", "message": "Kelas TI101-A tidak tersedia" }] }, "trace_id": "***" }
// Response 403 (belum lunas — AC-03)
{ "success": false, "error": { "code": "SPP_NOT_PAID", "message": "SPP belum lunas penuh. KRS hanya bisa diisi setelah lunas." }, "trace_id": "***" }
```

### 5.4 WebSocket Events (Socket.io)

| Event | Arah | Deskripsi |
|-------|------|-----------|
| `waiting:token` | Server → Client | Virtual Token saat masuk antrean ruang tunggu |
| `waiting:enter_now` | Server → Client | Slot kosong → instruksi masuk otomatis (F-17) |
| `krs:approved` / `krs:rejected` | Server → Client | Status KRS berubah (AC-04) |
| `substitute:active` | Server → Client | Substitute aktif — info ke mahasiswa & dosen pengganti (F-25) |
| `notification:new` | Server → Client | Notifikasi in-app |

## 6. Keamanan

### 6.1 RBAC Matrix (5 Tipe Akun + Atribut Wali)

| Fitur / Endpoint | Mahasiswa | Dosen (non-Wali) | Dosen (Wali) | Admin Akademik | Admin Keuangan | Admin Sistem |
|------------------|-----------|------------------|--------------|----------------|----------------|--------------|
| Login / Profil | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit Kontak | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Lihat Transkrip / IPK sendiri | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Lihat Transkrip binaan | ❌ | ❌ | ⚠️ asumsi | ✅ | ❌ | ✅ |
| Unduh Transkrip (mhs) | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Isi KRS (syarat lunas) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Lihat Kelas Tersedia | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Approve/Reject KRS | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Lihat daftar mhs di kelasnya | ❌ | ✅ (kelasnya) | ✅ (kelasnya) | ✅ (semua) | ❌ | ✅ |
| Input Nilai | ❌ | ✅ (kelasnya) | ✅ (kelasnya) | ✅ (semua + atribusi) | ❌ | ✅ |
| Edit Nilai (atribusi wajib) | ❌ | ✅ (sendiri) | ✅ (sendiri) | ✅ (semua) | ❌ | ✅ |
| Pilih MK (filter prodi) | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Ketersediaan Jadwal | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Absensi (wajib materi) | ❌ | ✅ (kelasnya) | ✅ (kelasnya) | ✅ (semua) | ❌ | ✅ |
| Bimbingan (catatan) | ✅ (sendiri) | ❌ | ✅ (binaan) | ✅ (semua) | ❌ | ✅ |
| Substitute Teaching | ❌ | ✅ (ajukan) | ✅ (ajukan) | ✅ (ajukan + kelola) | ❌ | ✅ |
| Lihat Payroll | ❌ | ✅ (sendiri) | ✅ (sendiri) | ❌ | ✅ (semua) | ✅ |
| Input Payroll | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Generate Tagihan | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Update Status Bayar | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| User Management (CRUD) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Audit Log View | ❌ | ❌ | ❌ | ✅ (read) | ✅ (read) | ✅ |
| Impor Data | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

> ⚠️ = asumsi Analyst (lihat §15 Asumsi #9 & Open Questions); perlu konfirmasi pemilik sebelum implementasi Iterasi 1.

### 6.2 Enforcement

- Middleware `authorize(roles[])` di setiap route (berdasarkan `users.role_id`).
- Policy service untuk logika non-trivial: ownership (dosen hanya kelasnya), scope binaan (wali hanya mahasiswa binaannya), atribut Wali (`users.is_wali`).
- UI (React) membaca menu yang diizinkan dari `GET /users/me` → hide/disable aksi di luar peran (AC-10). **Backend tetap otoritas final** — UI hanya cermin.

### 6.3 Auth & Session

- **Access Token:** 15 menit; payload: `userId, role, isWali, prodiId` (JWT signed, `JWT_SECRET` dari env).
- **Refresh Token:** 7 hari; HttpOnly + Secure + SameSite=Strict cookie; rotasi tiap refresh; revoke saat logout.
- **Session timeout:** idle 15 menit (S-02) — di-enforce di Redis session TTL; logout/session timeout → `DECR active_users_count` (ruang tunggu).
- **Rate limiting:** sliding window di Redis (S-04, F-04).

### 6.4 Anti SQL Injection (F-03, S-03)

- Prisma ORM (parameterized) untuk semua query; `pg` pool dengan `pool.query(sql, params)` — **tanpa string concatenation**.
- Zod schema di tiap endpoint; input dinamis (sort, search) melalui whitelist kolom.

### 6.5 Audit Trail & Atribusi (F-13, S-06, S-07)

```typescript
await auditService.log({
  userId: currentUser.id,
  action: 'UPDATE',
  entityType: 'GRADE',
  entityId: gradeId,
  oldValue: oldGrade,
  newValue: newGrade,
  inputByLabel: `diinput oleh ${currentUser.fullName} (${currentUser.role})`
});
```
- UI menampilkan badge "diinput oleh X" di halaman nilai, KRS, payroll, absensi, bimbingan.
- `audit_logs` memakai JSONB untuk old/new value (fleksibel, tidak perlu skema per entity).

### 6.6 Proteksi Data & Privasi

- Password: bcrypt (cost 10+). Default password akun hasil impor wajib diganti saat login pertama.
- Payroll: visibilitas ketat (dosen bersangkutan + admin keuangan) — di-enforce di query level (F-26).
- Data sensitif (nilai, pembayaran, payroll) tidak pernah dikirim ke klien di luar scope peran.
- HTTPS wajib (Nginx SSL termination); cookie refresh token Secure.
- Secret/token **tidak pernah** ditulis ke artefak/kode — hanya env var (S-04 pipeline).

## 7. Skalabilitas & Performa (5.000 Simultan)

### 7.1 Virtual Waiting Room (F-17, NF-05)

- **Ambang:** `WAITING_ROOM_THRESHOLD` — **default 5.000** (AC-01). Nilai bisa diturunkan jika load test (T1.14/T4.5) menunjukkan batas aman backend lebih rendah; keputusan tuning tercatat di `docs/decision-log.md` DL-11.
- **Mekanisme:** Redis `active_users_count` (INCR/DECR dengan TTL 15 menit) + `waiting_queue` (LPUSH/RPOP) + Socket.io room per token.
- **Flow:**
  1. Request masuk → Nginx → cek `active_users_count` (Lua script atomik).
  2. `< ambang` → forward ke backend, INCR.
  3. `>= ambang` → LPUSH ke queue, return 429 + Virtual Token + UI Ruang Tunggu.
  4. Logout/session timeout → DECR → RPOP queue → WebSocket push `waiting:enter_now`.
  5. **Fallback polling 30 detik** jika WebSocket gagal (K-09).

### 7.2 Caching Strategy (Redis)

| Data | TTL | Invalidation |
|------|-----|--------------|
| Kurikulum per prodi | 1 jam | Admin buka/tutup MK |
| Kelas tersedia (kuota > 0) | 30 detik | KRS submit (pub/sub) |
| Transkrip mahasiswa | 5 menit | Nilai baru diinput |
| Session user | 15 menit | Logout / refresh |

### 7.3 Load Balancer & Backend

- Nginx upstream: 3+ backend replicas (horizontal scaling).
- **Tidak perlu sticky session** (stateless JWT + Redis session).
- Health check `/health` (DB + Redis connectivity); SSL termination di Nginx.
- Graceful shutdown (SIGTERM → stop accept → drain request).

### 7.4 Database Connection Pool

- **PgBouncer** (transaction pooling) di depan PostgreSQL.
- Pool size 100; target p99 < 2s (NF-02) diverifikasi lewat k6 (T1.14).

## 8. Integrasi

| Integrasi | Tipe | Status | Detail |
|-----------|------|--------|--------|
| **Impor Data Awal** | File (Excel/CSV) | Iterasi 1 | `POST /import/*`; streaming parse; validasi schema; upsert NIM/NIK; laporan baris gagal + alasan |
| **Payment Gateway** | API (Midtrans/Xendit/dll) | Iterasi 4 | **Adapter pattern**; interface `PaymentGatewayProvider`; mock di dev; webhook → update status pembayaran (idempotent) |
| **PDDikti** | API (REST/SOAP) | Iterasi 4 | Sync mahasiswa/dosen/nilai; scheduled job; idempotent; error handling + retry |
| **Notifikasi** | Email/in-app dulu; WA/Telegram plugin | Iterasi 2+ | Interface `NotificationProvider`; default email + in-app (tabel `notifications`) |

## 9. Error Handling & Resiliency

### 9.1 Taksonomi Error API

| HTTP | Code | Contoh Kasus | UI (AC-09) |
|------|------|--------------|------------|
| 400 | `VALIDATION_ERROR` | Input tidak valid | Inline per field |
| 401 | `UNAUTHORIZED` | Token invalid/expired | Redirect login halus (tanpa "loading terus") |
| 403 | `FORBIDDEN` | Di luar peran (AC-10) | Sembunyikan aksi; jika dipaksa, pesan kontekstual |
| 403 | `SPP_NOT_PAID` | KRS sebelum lunas (AC-03) | Inline di halaman KRS |
| 404 | `NOT_FOUND` | Resource tidak ada | Inline/empty state |
| 409 | `CLASS_FULL` | Kuota penuh (AC-02) | Inline per kelas |
| 409 | `KRS_LOCKED` | Edit setelah submit (AC-07) | Pesan + tombol lihat status |
| 409 | `KRS_PERIOD_CLOSED` | Di luar periode (AC-04a) | Inline |
| 429 | `RATE_LIMITED` | Brute force / waiting room | Pesan + countdown |
| 500 | `INTERNAL_ERROR` | Bug server | Pesan umum + trace_id (detail di log) |

### 9.2 Prinsip UX Error

- Error **inline di dekat field** bermasalah; tidak pakai toast/popup global (AC-09).
- API mengembalikan `details[].field` agar frontend bisa memetakan ke field.
- `trace_id` direturn ke klien dan dicatat di log (Loki) untuk debugging.

### 9.3 Resiliency

- **Retry:** request idempotent (KRS submit memakai idempotency key) — retry aman saat timeout.
- **Circuit breaker:** integrasi eksternal (payment gateway, PDDikti) pakai pola circuit breaker — kegagalan provider tidak menjatuhkan core system.
- **Graceful degradation:** Redis down → waiting room off (allow semua) + cache bypass; WebSocket down → polling; notifikasi gagal → retry + log.
- **DB:** transaksi ACID; constraint unik sebagai jaring pengaman terakhir.

## 10. Observability

### 10.1 Metrics (Prometheus)

| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| `http_requests_total` | Counter | - |
| `http_request_duration_seconds` | Histogram | p99 > 2s (NF-02) |
| `active_users_count` | Gauge | > 4.500 (warning), >= ambang (critical, waiting room aktif) |
| `waiting_queue_size` | Gauge | > 500 (warning) |
| `db_connection_pool_usage` | Gauge | > 80% |
| `redis_memory_usage_bytes` | Gauge | > 80% maxmemory |
| `krs_submit_success_total` / `krs_submit_failed_total` | Counter | failed > 1% |
| `login_failed_total` | Counter | > 10/menit (brute force) |

### 10.2 Logging (Loki + Structured JSON)

```json
{ "timestamp": "2026-08-01T10:00:00.000Z", "level": "info", "trace_id": "uuid",
  "user_id": 123, "role": "MAHASISWA", "action": "KRS_SUBMIT",
  "entity": "KRS_SUBMISSION", "entity_id": 456, "duration_ms": 45, "status": "success" }
```

### 10.3 Alerting & Dashboard (Grafana)

- Critical: `active_users_count` ≥ ambang, DB pool > 90%, 5xx > 5%.
- Warning: queue > 500, p99 > 2s, login failed > 10/min.
- Dashboard: Overview (RPS/latency/error/active), KRS Real-time, Database, Redis, Business (login/hari, KRS/hari, status bayar).

## 11. Testing Strategy

| Level | Tools | Cakupan | Gate |
|-------|-------|---------|------|
|| Unit | Jest (backend) + Vitest 3 (frontend) | Service & policy logic (nilai 20/30/50, IPK, skala A–E, kuota) | Coverage ≥80% (lines, branches, functions) |
| Integration | Jest + Testcontainers | API per modul + RBAC per peran + transaksi KRS (locking) | Semua critical path pass |
| Load | k6 | Simulasi 1k → 3k → 5k simultan KRS submit + waiting room | p99 < 2s, error < 1% (T1.14, T4.5) |
| E2E | Playwright | Critical path: login → bayar → KRS → nilai → absensi → transkrip | 100% critical path, CI gate (T5.7) |
| Security | npm audit / Trivy + manual | Dependency scan; RBAC bypass attempt; SQLi scan (T4.7) | 0 critical, 0 high |

**Atribusi test:** setidaknya satu test per aksi RBAC (setiap sel ✅ di matrix §6.1) — mencegah regresi hak akses (AC-10).

## 12. Deployment Strategy

### 12.1 Topologi

```mermaid
flowchart TB
    Internet["Internet"] --> DNS["DNS (A Record)"]
    DNS --> LB["Nginx\nSSL + Rate Limit + Waiting Room Check"]
    LB --> BE1["Backend #1 (Node.js)"]
    LB --> BE2["Backend #2"]
    LB --> BE3["Backend #3"]
    BE1 --> PGB["PgBouncer"]
    BE2 --> PGB
    BE3 --> PGB
    PGB --> PG[("PostgreSQL 16\nPrimary")]
    PG --> PGR[("PostgreSQL Replica\n(Read)"]
    BE1 --> RC["Redis 7"]
    BE2 --> RC
    BE3 --> RC
    RC --> WS["Socket.io (in-process backend)"]
    BE1 --> MON["Prometheus + Grafana + Loki"]
    BE2 --> MON
    BE3 --> MON
```

> Catatan refine: Socket.io berjalan in-process di backend (bukan server terpisah) — lebih sederhana untuk monolith modular; proxy WebSocket di Nginx.

### 12.2 Docker Compose (Production)

```yaml
services:
  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes: ["./nginx.conf:/etc/nginx/nginx.conf", "./certs:/etc/ssl"]
    depends_on: [backend]
  backend:
    build: ./backend
    deploy:
      replicas: 3
      resources: { limits: { cpus: '1', memory: 512M } }
    environment:
      - DATABASE_URL=postgres://user:***@pgbouncer:6432/siak
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1))"]
      interval: 10s
      timeout: 5s
      retries: 3
    depends_on: [pgbouncer, redis, migrate]
  migrate:
    build: ./backend
    command: ["npm", "run", "migrate:up"]
    environment:
      - DATABASE_URL=postgres://user:***@postgres:5432/siak
  pgbouncer:
    image: edoburu/pgbouncer
    environment:
      - DATABASE_URL=postgres://user:***@postgres:5432/siak
      - POOL_MODE=transaction
      - MAX_CLIENT_CONN=1000
      - DEFAULT_POOL_SIZE=100
  postgres:
    image: postgres:16-alpine
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      - POSTGRES_DB=siak
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes: ["redisdata:/data"]
  prometheus:
    image: prom/prometheus
    volumes: ["./prometheus.yml:/etc/prometheus/prometheus.yml"]
  grafana:
    image: grafana/grafana
    volumes: ["grafanadata:/var/lib/grafana"]
  loki:
    image: grafana/loki
    volumes: ["lokidata:/loki"]
volumes:
  pgdata:
  redisdata:
  grafanadata:
  lokidata:
```

> Catatan refine: service `migrate` terpisah (migrasi sebelum backend start — K-01); `redis:7-alpine` (bukan `redis:7-cluster` yang tidak eksis); healthcheck tanpa `curl` di image alpine (pakai `node -e fetch`).

### 12.3 Environment Variables (`.env.production` — nilai placeholder, jangan di-commit)

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://user:***@pgbouncer:6432/siak
REDIS_URL=redis://redis:6379
JWT_SECRET=<64-char-random>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
WAITING_ROOM_THRESHOLD=5000
SESSION_TIMEOUT_MS=900000
CORS_ORIGIN=https://siak.kampus.ac.id
NOTIFICATION_PROVIDER=email
```

### 12.4 Release & Rollback

- **Staging:** auto-deploy dari `main` (CI pass) — environment terpisah.
- **Production:** manual trigger `workflow_dispatch` setelah smoke test staging ≥2 hari + approval pemilik.
- **Rollback:** migrasi `down` (node-pg-migrate) + rollback image (Docker tag) + restore backup DB. Release checklist per iterasi di `docs/03-execution-plan.md` §9.

## 13. Alternatif yang Dipertimbangkan

| # | Keputusan | Alternatif | Alasan pilih | Referensi |
|---|-----------|------------|--------------|-----------|
| ALT-1 | Node.js/Express | Python FastAPI, Go Gin, .NET 9 | Satu bahasa TS (backend+frontend), ekosistem real-time, produktivitas 1 dev; performa cukup di 5k | DL-02 |
| ALT-2 | React/Vite/Tailwind | Next.js, Vue/Nuxt, SvelteKit | SPA cukup (tidak butuh SSR/SEO); Vite HMR cepat; Tailwind konsisten | DL-03 |
| ALT-3 | PostgreSQL 16 | MySQL 8, MariaDB | JSONB + partial unique index + row-level security untuk audit & RBAC; ACID kuat | DL-04 |
| ALT-4 | Redis 7 | In-memory app-level, memcached | Butuh queue + counter + session + cache sekaligus | DL-05 |
| ALT-5 | Socket.io | SSE, polling-only, MQTT | Fallback polling built-in (K-09); room per token; mature | DL-06 |
| ALT-6 | Monolith modular | Microservices | 1 dev; satu deployable; domain terpisah di dalam | DL-07 |
| ALT-7 | Migrasi node-pg-migrate | golang-migrate, Prisma migrate | Satu bahasa (Node); SQL eksplisit up/down; Go tidak perlu jadi toolchain wajib | DL-15 |
| ALT-8 | Ambang waiting room default 5.000 | 2.000 (rekomendasi awal brief), 10.000 (PRD) | AC-01 = stabil di 5.000; ambang configurable, dituning load test | DL-11 |

## 14. Risiko

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| Waiting room/5k simultan sulit diverifikasi tanpa beban nyata | Klaim "siap ribuan pengguna" tidak teruji | Load test bertahap k6 (T1.14, T4.5); ambang configurable (DL-11) |
| RBAC 5 tipe akun + atribut Wali kompleks | Kebingungan hak akses terulang | Matrix §6.1 di-review sebelum coding; 1 test per sel RBAC; E2E (T5.7) |
| Integrasi eksternal (payment, PDDikti) belum ada | Blokir alur pembayaran | Adapter pattern + mock; manual dulu (F-19); real di Iterasi 4 |
| Payroll detail TBD | Estimasi usaha tidak akurat | F-26 minimal dulu; detail Iterasi 4 (K-05) |
| NIM existing dari sistem lain | Impor gagal/duplikat | Upsert + unique index + laporan baris gagal (K-08) |
| Kode berantakan terulang | Maintenance cost tinggi | Quality gates CI sejak commit pertama (K-06) |
| WebSocket gagal di production | Waiting room/notif tidak jalan | Fallback polling 30s (K-09); chaos test (T4.1) |
| Repo git belum diinisialisasi | Handoff Developer tertunda | Pemilik inisialisasi repo + remote sebelum Developer mulai |

## 15. Asumsi (Eksplisit)

1. Skala: ±2.000 mahasiswa, ±100 dosen, ±5 admin per peran, puncak ±5.000 simultan (perkiraan user — Confirmed Fact #10).
2. Bahasa antarmuka: Bahasa Indonesia.
3. Hosting: VPS/cloud, deployment-ready Docker; keputusan final + admin teknis menyusul (K-01, K-02).
4. **Dosen Wali dapat melihat transkrip/IPK mahasiswa binaan** — asumsi Analyst untuk fungsi bimbingan; belum dikonfirmasi user (Open Question #6).
5. Kanal notifikasi default email + in-app; WA/Telegram via plugin nanti (Open Question #7).
6. KRS "otomatis disiapkan prodi" untuk mahasiswa baru (F-08d) diimplementasikan sebagai: Admin Akademik membuat KRS draft awal per mahasiswa baru berdasarkan kurikulum semester 1; mahasiswa tinggal review & submit.
7. Format impor Excel/CSV disepakati saat Iterasi 1 (kolom: nim, full_name, prodi_code, angkatan, kontak; nik, full_name, prodi_code untuk dosen; kode, nama, sks untuk matkul) — Open Question #1.
8. Satu developer full-time untuk estimasi ~24 minggu (docs/03).

## 16. Open Questions

1. Format file & struktur kolom impor data lama (Open Question #1 requirements).
2. Keputusan hosting final + admin teknis.
3. Payroll: skema honor, dosen kontrak, pengaruh absensi (Iterasi 4).
4. Denda keterlambatan pembayaran (saat ini tanpa denda).
5. Aturan khusus matkul diulang.
6. Visibilitas Dosen Wali terhadap transkrip binaan (Asumsi #4).
7. Kanal notifikasi KRS (email/WA/Telegram).

## 17. Traceability Matrix

| Spec Section | Requirements |
|--------------|--------------|
| Arsitektur (A-1 s.d. A-8) | NF-01, NF-04, NF-05, NF-06, AC-01, AC-02, AC-09, AC-10, K-01, K-02, K-03, K-06, K-09 |
| Komponen (2.3) | F-01~F-26 (per baris komponen), NF-01~NF-06, S-01~S-07 |
| Workflow (2.4) | F-07, F-10, F-23, F-25, AC-02~AC-04c, AC-07 |
| Stack (3) | Semua (justifikasi per baris) |
| Data model (4) | F-05~F-26, AC-02, AC-07, K-08, S-06, S-07 |
| API (5) | F-01~F-26, S-01~S-07, AC-02~AC-10 |
| Keamanan (6) | S-01~S-07, AC-03, AC-08, AC-10, K-07 |
| Skalabilitas (7) | F-17, NF-02, NF-04, NF-05, NF-06, AC-01, AC-02, K-04, K-09 |
| Integrasi (8) | F-18, F-19, AC-04d, K-03, K-08 |
| Error handling (9) | AC-02, AC-03, AC-04a, AC-07, AC-08, AC-09, S-04 |
| Observability (10) | NF-02, NF-06, AC-01 |
| Testing (11) | K-06, AC-01, AC-02, AC-10 |
| Deployment (12) | K-01, K-02, K-06 |
| Alternatif (13) | Semua (justifikasi) |
| Risiko (14) | K-03, K-05, K-06, K-08, K-09 |

---\n\n**Status:** ✅ **APPROVED** (2026-08-01, Tugas #2) → lanjut ke Developer (Implementation Log: `docs/04-implementation-log.md`).
