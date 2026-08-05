# Decision Log — Siak (Sistem Informasi Akademik)

> **Tanggal pembuatan:** 2026-08-01 (Analyst, Tugas #1)
> **Tujuan:** Mencatat keputusan desain & alasan (rationale), alternatif yang dipertimbangkan, dan konsekuensi — agar tidak ada keputusan yang hilang konteksnya.
> **Status nilai:** `DIPUTUSKAN` = final untuk scope ini; `DITUNDA` = keputusan ditunda menunggu info user; `TBD` = masih terbuka.

---

## DL-01 — Proyek dibangun ulang dari nol
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Iterasi sebelumnya (Siakad, Siakad_V2, Siakad_V3) dinilai kurang memuaskan; PRD SIAKAD V2 adalah sumber kebutuhan utama.
- **Keputusan:** Membangun sistem baru di `C:\Users\ratih\source\repos\Siak` berdasarkan PRD SIAKAD V2 + hasil wawancara; detail teknis iterasi lama tidak dibawa otomatis.
- **Alternatif:** Melanjutkan/memperbaiki Siakad_V2/V3.
- **Alasan:** Keluhan user (Confirmed Fact #11) — performa, kode berantakan, RBAC membingungkan; perbaikan inkremental dianggap tidak cukup.
- **Konsekuensi:** Semua keputusan teknis di bawah ini berlaku untuk sistem baru; data lama masuk lewat impor (F-18).

## DL-02 — Backend: Node.js 22 + TypeScript + Express
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Runtime tersedia: Node 22.15, Python 3.11, .NET 9, Go 1.22. Java/PHP tidak tersedia.
- **Keputusan:** Backend memakai Node.js 22 + TypeScript + Express.
- **Alternatif:** Python (FastAPI/Django), Go (Gin/Echo), .NET 9.
- **Alasan:**
  - Satu bahasa (TypeScript) untuk backend + frontend → mengurangi konteks switching untuk 1 developer;
  - Event loop cocok untuk beban I/O tinggi (5k simultan, KRS submit);
  - Ekosistem middleware (JWT, rate limit, multer, socket.io) mempercepat implementasi RBAC, audit, real-time;
  - Runtime terverifikasi di environment (22.15.0).
- **Konsekuensi:** Performa CPU-bound lebih rendah daripada Go/.NET — tidak relevan untuk workload CRUD + I/O ini; mitigasi: horizontal scaling (3+ replica).

## DL-03 — Frontend: React 18 + TypeScript + Vite + Tailwind CSS
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** NF-01 responsive, AC-09 error inline, AC-10 RBAC UI; keluhan UX iterasi lama.
- **Keputusan:** React 18 SPA (Vite build) + Tailwind CSS + React Query.
- **Alternatif:** Next.js (SSR), Vue/Nuxt, SvelteKit.
- **Alasan:** SPA cukup (tidak butuh SSR/SEO internal); Vite HMR cepat; Tailwind memudahkan design system konsisten; React Query untuk caching server state (performa login/halaman).
- **Konsekuensi:** SEO publik tidak relevan (sistem internal kampus); bundle dioptimalkan di T5.6 (<200KB gz).

## DL-04 — Database: PostgreSQL 16
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** F-07/AC-02 butuh integritas kuota ketat; S-06/S-07 butuh audit trail; AC-01 5k simultan.
- **Keputusan:** PostgreSQL 16 (primary + read replica; PgBouncer di depan).
- **Alternatif:** MySQL 8, MariaDB, MongoDB.
- **Alasan:** ACID transaksi + `SELECT FOR UPDATE` untuk KRS locking; JSONB untuk audit log (old/new value fleksibel); partial unique index untuk aturan "satu submission aktif per mahasiswa per semester"; row-level security opsional untuk RBAC; mature untuk skala ini.
- **Konsekuensi:** Perlu disiplin migrasi (node-pg-migrate) dan backup; biaya managed DB lebih tinggi daripada MySQL — dapat dijalankan self-hosted di VPS.

## DL-05 — Cache/Queue/Session: Redis 7
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** F-17 waiting room (counter + queue), NF-02 caching, NF-04 session stateless.
- **Keputusan:** Redis 7 (single instance dulu; cluster opsional saat skala naik).
- **Alternatif:** Memcached, in-memory app-level, PostgreSQL-only.
- **Alasan:** Satu komponen melayani 3 kebutuhan (cache, queue, session/counter); TTL & INCR/DECR atomik; operasional sederhana di VPS.
- **Konsekuensi:** Redis menjadi dependency kritis → graceful degradation wajib (Redis down → waiting room off, cache bypass) di T4.1.

## DL-06 — Real-time: Socket.io + fallback polling
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** F-17 waiting room, F-25 substitute, AC-04d notifikasi; K-09 fallback.
- **Keputusan:** Socket.io (in-process di backend) dengan fallback polling 30 detik.
- **Alternatif:** SSE, polling-only, MQTT.
- **Alasan:** Socket.io menyediakan room per user/token, reconnect, dan transport fallback (WebSocket → long-polling) — sesuai K-09; in-process menghindari server terpisah (monolith modular, DL-07).
- **Konsekuensi:** Proxy WebSocket harus dikonfigurasi di Nginx; beban koneksi lama harus dipantau (dashboard).

## DL-07 — Arsitektur: Monolith Modular (bukan Microservices)
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Tim 1 developer; skala 5k simultan; kebutuhan domain beragam (KRS, nilai, keuangan, dosen).
- **Keputusan:** Satu codebase backend monolith modular (folder per modul: auth, rbac, krs, academic, finance, dosen, audit, notification, import) dalam satu deployable.
- **Alternatif:** Microservices per domain, modular monolith dengan plugin.
- **Alasan:** Microservices over-engineering untuk 1 developer (biaya operasional, jaringan, deploy); modular monolith tetap memberi batas domain yang jelas (A-1).
- **Konsekuensi:** Skala horizontal = replica aplikasi + DB replica; jika suatu saat domain tertentu perlu diskalakan sendiri, modul bisa dipisah karena batas domain sudah ada.

## DL-08 — Model RBAC: 5 tipe akun + atribut Wali
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Confirmed Facts #15–17; K-07; AC-10.
- **Keputusan:** Tipe akun: Mahasiswa, Dosen, Admin Akademik, Admin Keuangan, Admin Sistem (superuser). Status **Wali = atribut** pada akun Dosen (`users.is_wali`), bukan peran terpisah.
- **Alternatif:** 6 peran terpisah (Dosen Wali sebagai peran), permission-based (bukan role-based).
- **Alasan:** Sesuai keputusan user Opsi A (Confirmed Fact #16); satu tipe akun Dosen dengan fitur tambahan kondisional lebih sederhana dan mencegah duplikasi menu; Admin Sistem superuser mengakses semua modul termasuk fitur mahasiswa & dosen.
- **Konsekuensi:** Policy service harus menangani logika kondisional (is_wali, ownership kelas, scope binaan) — di-test 1 kasus per sel matrix (T1.4, T5.3).

## DL-09 — Approval KRS hanya Admin Akademik (revisi PRD)
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Confirmed Fact #18 — revisi dari PRD yang awalnya berjenjang Dosen Wali → Admin.
- **Keputusan:** Dosen Wali **hanya melihat** daftar mahasiswa di kelasnya (read-only); yang setuju/tolak **hanya Admin Akademik** (saat ini berdasarkan pelunasan SPP).
- **Alternatif:** Alur PRD lama (Wali approval dulu, lalu Admin).
- **Alasan:** Keputusan eksplisit user; menyederhanakan alur dan menghilangkan kebingungan hak akses (keluhan #5).
- **Konsekuensi:** Fitur "approval wali" tidak diimplementasikan; kebutuhan berubah lagi → sesuaikan di sini.

## DL-10 — Nilai langsung tampil tanpa gate approval; edit admin + atribusi
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Confirmed Fact #20; F-10; AC-05.
- **Keputusan:** Nilai yang diinput Dosen **langsung tampil** di mahasiswa (tanpa approval). Admin Akademik boleh mengedit menu dosen, tetapi wajib atribusi "diinput oleh user X" tampak di UI.
- **Alternatif:** Gate approval nilai berjenjang (PRD awal).
- **Alasan:** Keputusan user; menghindari bottleneck validasi nilai; atribusi menjaga akuntabilitas tanpa memblokir transparansi.
- **Konsekuensi:** Audit trail menjadi satu-satunya jejak perubahan — implementasinya wajib (T1.9) dan tidak bisa dilewati.

## DL-11 — Ambang waiting room default 5.000, configurable, dikalibrasi lewat load test
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN (dengan catatan kalibrasi)
- **Konteks:** AC-01 = stabil di 5.000 simultan (Confirmed Fact #10). Rekomendasi awal brief menyebut ±2.000 (draf lama, sebelum skala nyata dikonfirmasi); PRD menyebut 10.000.
- **Keputusan:** `WAITING_ROOM_THRESHOLD` **default 5.000** (env var). Nilai diturunkan jika load test (T1.14, T4.5) menunjukkan batas aman backend < 5.000; keputusan kalibrasi dicatat di sini sebagai amendemen.
- **Alternatif:** 2.000 (draf awal), 10.000 (PRD).
- **Alasan:** Ambang harus ≥ kapasitas target agar AC-01 terpenuhi (stabil di 5.000 sebelum antrean aktif); 10.000 terlalu tinggi untuk skala nyata (±5.000 puncak) dan tidak realistis; nilai 2.000 akan memicu antrean di bawah kapasitas yang justru harus ditanggung.
- **Konsekuensi:** Waiting room aktif hanya di atas ambang; operasional bisa menyesuaikan ambang tanpa perubahan kode (env var). *(Menggantikan rekomendasi "±2.000" di docs/00 Recommendations #5 — lihat catatan di bawah.)*

> **Catatan konsistensi dokumen:** docs/00 Recommendations #5 menyebut ambang "±2.000" — nilai itu ditulis sebelum skala nyata (5.000 puncak, Confirmed Fact #10/AC-01) dikonfirmasi. DL-11 ini adalah keputusan Analyst yang menyelesaikan inkonsistensi: ambang default 5.000 mengikuti AC-01. Jika pemilik tetap menghendaki 2.000, cukup ubah env var; keputusan ini dicatat agar tidak menimbulkan konflik antar artefak.

## DL-12 — Pembayaran manual dulu; payment gateway via adapter di Iterasi 4
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Confirmed Fact #12; K-03; F-19.
- **Keputusan:** Mode saat ini = Admin Keuangan update status pembayaran manual. Integrasi payment gateway (Midtrans/Xendit/dll) di Iterasi 4 memakai **adapter pattern** + mock di development.
- **Alternatif:** Integrasi gateway langsung sejak awal.
- **Alasan:** Keputusan user; menghindari ketergantungan eksternal yang belum dipilih; desain tetap siap.
- **Konsekuensi:** Webhook idempotent dan interface `PaymentGatewayProvider` harus disiapkan di T4.2; alur manual tetap berfungsi setelah gateway aktif (dual mode).

## DL-13 — PDDikti ditunda ke Iterasi 4
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN (detail integrasi TBD)
- **Konteks:** Confirmed Fact #12; K-03; Open Question.
- **Keputusan:** Sinkronisasi PDDikti (dua arah) dijadwalkan Iterasi 4; detail API belum dikonfirmasi user → implementasi memakai scheduled job idempotent + retry.
- **Alternatif:** Integrasi di awal.
- **Alasan:** Bukan kebutuhan saat ini; sistem berjalan mandiri dulu.
- **Konsekuensi:** Data akademik tidak otomatis sinkron ke PDDikti sampai Iterasi 4.

## DL-14 — Payroll: implementasi minimal dulu (F-26), detail perhitungan TBD
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN untuk minimal / **TBD** untuk detail
- **Konteks:** Confirmed Facts #14, #22, #26; K-05.
- **Keputusan:** F-26 diimplementasikan minimal di Iterasi 2 (input oleh Admin Keuangan; visibilitas hanya dosen bersangkutan + admin keuangan; siklus dosen tetap per bulan). **Skema perhitungan honor, aturan dosen kontrak, dan pengaruh absensi** menunggu keputusan user → diimplementasikan di T4.4 (Iterasi 4).
- **Alternatif:** Menunggu semua detail sebelum implementasi.
- **Alasan:** Fitur dasar bisa berjalan tanpa blokir; detail menghindari rework besar.
- **Konsekuensi:** Estimasi T4.4 masih berisiko berubah saat skema diputuskan user.

## DL-15 — Migrasi DB dengan tool Node (node-pg-migrate), bukan golang-migrate
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** K-01 (migrasi terpisah dari kode); stack backend Node (DL-02).
- **Keputusan:** Migrasi memakai `node-pg-migrate` (SQL up/down eksplisit, `V{YYYYMMDD}_{seq}__{desc}.sql`), dijalankan sebagai service `migrate` terpisah di Docker sebelum backend start.
- **Alternatif:** golang-migrate (Go tersedia), Prisma Migrate.
- **Alasan:** Satu bahasa toolchain (Node) — tidak menambah Go sebagai dependency build; SQL eksplisit memberi kontrol penuh atas index/constraint partial unique (kebutuhan AC-02); service migrasi terpisah dari kode aplikasi.
- **Konsekuensi:** Konsistensi skema dijaga lewat review migrasi; rollback via `migrate:down`.

## DL-16 — Struktur monorepo
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** T1.1; CI; deployment.
- **Keputusan:** Monorepo dengan layout: `backend/` (Node+TS), `frontend/` (React+Vite), `infra/` (docker-compose, nginx, prometheus, grafana, loki), `docs/`, `migrations/` (di dalam backend).
- **Alternatif:** Multi-repo (backend & frontend terpisah).
- **Alasan:** 1 developer; perubahan terkait (API + UI) direview bersama; CI sederhana; artefak docs satu tempat.
- **Konsekuensi:** Ukuran repo lebih besar; batas akses per-modul tidak relevan untuk tim kecil.

## DL-17 — Standar kualitas kode wajib sejak awal
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN
- **Konteks:** Keluhan "kode berantakan" (Confirmed Fact #11c); K-06.
- **Keputusan:** ESLint + Prettier + `tsc --noEmit` + Jest coverage ≥80% + integration test + code review min 1 reviewer + security scan; di-enforce di CI (GitHub Actions) sejak commit pertama.
- **Alternatif:** Tanpa gate ketat (mengikuti kebiasaan iterasi lama).
- **Alasan:** Mencegah regresi keluhan iterasi sebelumnya; AC-08~AC-10 membutuhkan kualitas konsisten.
- **Konsekuensi:** Sedikit overhead setiap PR; diimbangi pengurangan bug & rework.

## DL-18 — Deployment-ready VPS/cloud (keputusan hosting final ditunda)
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN untuk arsitektur / **DITUNDA** untuk penyedia
- **Konteks:** K-01, K-02; Confirmed Fact #13.
- **Keputusan:** Arsitektur deployment-ready (Docker, env vars, health check, graceful shutdown, migrasi terpisah, staging environment). **Penyedia hosting + admin teknis** menunggu keputusan pemilik (Open Question #2).
- **Alternatif:** Hosting di laptop lokal.
- **Alasan:** Laptop user tidak 24/7 (K-02); kampus nyata butuh selalu online.
- **Konsekuensi:** Saat penyedia diputuskan, deploy = sesuaikan env + DNS; tidak ada perubahan arsitektur.

---

## DL-19 — Implementasi T1.1: interpretasi gate, versi library, desain health check
- **Tanggal:** 2026-08-01 | **Status:** DIPUTUSKAN (Developer, Tugas #1)
- **Konteks:** Prompt pemilik memerintahkan implementasi, sementara docs/02 & docs/03 masih berstatus DRAFT menunggu APPROVE SPECIFICATION; repo git belum diinisialisasi (F-31).
- **Keputusan:**
  1. **Gate:** Instruksi pemilik *"Implementasi sesuai docs/02 dan docs/03"* ditafsirkan sebagai persetujuan untuk memulai implementasi (approval implisit). Asumsi ini dicatat eksplisit di `docs/04-implementation-log.md` §1.1 dan `docs/project-status.md` Open Items #1; jika pemilik belum bermaksud approve, konfirmasi diperlukan.
  2. **Git:** Developer TIDAK menjalankan `git init`/`commit`/`push` (F-31). File CI disiapkan; validasi gate dijalankan lokal.
  3. **Versi library (T1.1):** Express 4.21 (stabilitas middleware); Zod untuk validasi env; pino untuk structured logging; **Vitest 3** untuk unit test frontend (bukan Jest — spec §11 menetapkan Jest secara umum; Vitest API setara Jest, satu toolchain dengan Vite, menghindari konflik versi Vite 6; backend tetap Jest). Tailwind 3.4 (stabil, dokumentasi luas).
  4. **Health check:** `GET /health` = liveness; `GET /health/ready` = readiness (DB/Redis; `not_configured` dianggap siap; `down` → 503). Misconfig production ditangkap fail-fast oleh validasi env (DATABASE_URL/REDIS_URL/JWT_SECRET wajib saat NODE_ENV=production).
- **Alternatif:** Menunggu APPROVE SPECIFICATION formal sebelum coding; git init oleh Developer; Vitest 2 (bentrok Vite).
- **Alasan:** Instruksi pemilik eksplisit untuk implementasi; F-31 membatasi operasi git; Vitest 3 kompatibel dengan Vite 6; health check liveness+readiness memenuhi kebutuhan container orchestration (K-01).
- **Konsekuensi:** Jika pemilik tidak mengonfirmasi approval implisit, hanya dampak proses (bukan teknis) — T1.1 tidak menyentuh logika bisnis. CI aktif setelah pemilik init repo + push.

---

## Ringkasan Status

| ID | Keputusan | Status |
|----|-----------|--------|
| DL-01 | Bangun ulang dari nol (PRD V2) | DIPUTUSKAN |
| DL-02 | Node.js 22 + TS + Express | DIPUTUSKAN |
| DL-03 | React 18 + Vite + Tailwind | DIPUTUSKAN |
| DL-04 | PostgreSQL 16 | DIPUTUSKAN |
| DL-05 | Redis 7 | DIPUTUSKAN |
| DL-06 | Socket.io + fallback polling | DIPUTUSKAN |
| DL-07 | Monolith modular | DIPUTUSKAN |
| DL-08 | RBAC 5 tipe akun + atribut Wali | DIPUTUSKAN |
| DL-09 | Approval KRS hanya Admin Akademik | DIPUTUSKAN |
| DL-10 | Nilai langsung tampil + atribusi | DIPUTUSKAN |
| DL-11 | Ambang waiting room default 5.000 (configurable) | DIPUTUSKAN (kalibrasi via load test) |
| DL-12 | Payment manual dulu; gateway adapter Iterasi 4 | DIPUTUSKAN |
| DL-13 | PDDikti Iterasi 4 | DIPUTUSKAN |
| DL-14 | Payroll minimal dulu; detail TBD | DIPUTUSKAN / TBD |
| DL-15 | Migrasi node-pg-migrate | DIPUTUSKAN |
| DL-16 | Monorepo | DIPUTUSKAN |
| DL-17 | Quality gates wajib | DIPUTUSKAN |
| DL-18 | Deployment-ready; penyedia hosting ditunda | DIPUTUSKAN / DITUNDA |
| DL-19 | Implementasi T1.1: gate approval implisit, versi library, desain health check | DIPUTUSKAN (Developer) |
| DL-20 | Frontend: React 19.2 + react-router 8.3.0 (0 advisory; router 7.x tak lolos semua) | DIPUTUSKAN (Developer) |
| DL-21 | Token access/refresh di localStorage (SPA iterasi 1; migrasi httpOnly cookie di T5 bila perlu) | DIPUTUSKAN (Developer) |
| DL-22 | IPK transkrip dihitung dari SKS yang sudah dinilai saja (MK tanpa nilai tidak menurunkan IPK) | DIPUTUSKAN (Developer) |
| DL-23 | Route `/krs` di-share mahasiswa & admin via selector menu (krs.fill vs krs.approve); normalisasi snake_case di lapisan API client | DIPUTUSKAN (Developer) |
| DL-24 | Coverage threshold frontend aktif (≥80% stmts/funcs/branch) via `@vitest/coverage-v8`; `frontend/nginx.conf` + proxy `/api` untuk SPA container | DIPUTUSKAN (Developer) |
| DL-25 | Redis cache layer untuk data read-heavy (available-classes 30s, transkrip 5m, kurikulum 1h) dengan graceful degradation; invalidation on write | DIPUTUSKAN (Developer) | (≥80% stmts/funcs/branch) via `@vitest/coverage-v8`; `frontend/nginx.conf` + proxy `/api` untuk SPA container | DIPUTUSKAN (Developer) |

| DL-26 | Waiting room T1.13: gate 429 + x-waiting-token + ZSET antrean + sweeper + Socket.io push + polling fallback; Redis down → allow semua (graceful); threshold configurable (WR_THRESHOLD, default 5000); client token di sessionStorage + redirect /tunggu | DIPUTUSKAN (Developer) |
| DL-27 | Deadlock prevention: `ORDER BY cl.id` pada `SELECT ... FOR UPDATE` (krs draft/submit) — urut locking deterministik mencegah deadlock 40P01 di concurrency tinggi (T1.14 load test 5k VU). | DIPUTUSKAN (Developer) |
| DL-28 | `DATABASE_POOL_MAX` env + `DATABASE_POOL_MAX` di docker-compose.yml (default 20, prod VPS 200-300). `max_connections` postgres compose dev 300. Kalibrasi via load test (T1.14) → threshold aman ~1.500 VU; dikalibrasi ulang staging/prod. | DIPUTUSKAN (Developer) |
| DL-29 | Transkrip PDF via **pdfkit** (T2.4): skala nilai plus/minus (`GRADE_POINT`: A-=3.7, B+=3.3, dst) walau PRD menyebut AB/BC; matkul diulang → hanya nilai terbaik masuk IPK + baris lama ditandai `isRepeated` merah; akses dosen wali via `authorizeWali` (atribut `is_wali`), TANPA menambah permission dosen dasar (matriks RBAC test 1-per-sel tetap) | DIPUTUSKAN (Developer) |
| DL-30 | Notifikasi T2.5: kanal in-app langsung SENT saat insert; email (nodemailer) via antrean PENDING → SENT/FAILED dengan retry max 3× + `FOR UPDATE SKIP LOCKED` (anti double-send, crash-safe); **SMTP belum dikonfigurasi → fallback log-only** (graceful degradation, tidak menumpuk FAILED); scheduler `NOTIF_DELIVERY_INTERVAL_MS` default 5 menit; badge unread polling 60s | DIPUTUSKAN (Developer) |
**Keputusan yang menunggu pemilik:** penyedia hosting + admin teknis (DL-18), skema payroll (DL-14), kanal notifikasi, format impor, visibilitas transkrip Dosen Wali (asumsi → Open Question), **konfirmasi approval implisit T1.1 (DL-19)**.
