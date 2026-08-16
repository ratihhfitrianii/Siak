# Project Status — Siak (Sistem Informasi Akademik)

> **Diperbarui:** 2026-08-16 (Iterasi 6 tuntas — produksi PaaS + polish + master data)
> **Sumber:** Tugas #1 Coordinator + Analyst + Developer + Reviewer → **Tugas #2 Coordinator (CLI)**

---

## Status Pipeline

| Tahap | Status | Keterangan |
|-------|--------|------------|
| Requirements (docs/00, docs/01) | ✅ **APPROVED** (2026-08-01) | 26 Confirmed Facts, 20 jawaban wawancara, AC-01 s.d. AC-10. docs/01 di-refine Analyst (pembersihan teks draft/duplikasi; isi tidak berubah) |
|| Solution Spec (docs/02) | ✅ **APPROVE SPECIFICATION** (2026-08-01, Tugas #2) | Di-refine & dilengkapi Analyst: komponen & tanggung jawab, workflow, taksonomi error, testing strategy, alternatif, risiko, asumsi, open questions, traceability matrix; perbaikan konsistensi (ambang waiting room DL-11, index kuota, is_wali di users, migrasi node-pg-migrate) | **APPROVED** |
| Execution Plan (docs/03) | ✅ **APPROVE SPECIFICATION** (2026-08-01, Tugas #2) | Di-refine Analyst: perbaikan duplikasi ID task T3.5→T3.6, traceability requirement→task (semua MUST punya jalur implementasi + test), konsisten dengan spec |
| Decision Log (docs/decision-log.md) | ✅ **Ada** (2026-08-01) | 19 keputusan (DL-01 s.d. DL-19) — stack, arsitektur, RBAC, ambang waiting room, integrasi, migrasi, kualitas, deployment, implementasi T1.1 |
| Implementasi (docs/04) | 🟡 **T1.1 SELESAI** (2026-08-01) | `docs/04-implementation-log.md` dibuat Developer; T1.1 (repo monorepo + Docker + CI) tervalidasi lokal; T1.2–T1.15 menunggu repo git |
| Review (docs/05) | ✅ **SELESAI T1.1** (2026-08-01) | `docs/05-review-report.md` dibuat; verdict **CONDITIONALLY APPROVED** — T1.1 teknis solid; 2 syarat proses menunggu pemilik (APPROVE SPECIFICATION ✅ + repo git) |

---

## Verifikasi Lingkungan (2026-08-01)

| Item | Hasil | Implikasi |
|------|-------|-----------|
| Repo git di `C:\Users\ratih\source\repos\Siak` | ❌ **Bukan git repository** (`git status` → fatal) | Inisialisasi repo + remote GitHub belum dilakukan; CI (GitHub Actions, docs/03) menunggu remote; commit/push tetap manual pemilik (F-31) |
| Runtime tersedia | ✅ Node 22.15.0, Python 3.11.15, .NET 9.0.200, Go 1.22.5, Git 2.48.1 | Stack docs/02 (Node/TS) sesuai runtime; Java/PHP tidak tersedia |
| `docs/04-implementation-log.md` | ✅ Ada (2026-08-01) | T1.1 selesai; log lengkap (file, test, command, hasil) di docs/04 |
| Docker | ✅ Tersedia 28.0.4 (daemon awalnya off → di-start) | `docker compose up` dev berhasil; compose dev & prod valid |
| `docs/05-review-report.md` | ✅ **Ada (2026-08-01)** | Review T1.1 selesai; verdict CONDITIONALLY APPROVED; 6 findings (1 MEDIUM, 3 LOW, 2 INFORMATIONAL) |
| Token/secret di artefak | ✅ Tidak ditemukan (placeholder `***` / `<...>` di docs/02) | Sesuai S-04 |
| `docs/decision-log.md` | ✅ Ada (baru) | Keputusan desain terdokumentasi (DL-01 s.d. DL-19) |

---

## Task Breakdown (ringkas)

Detail lengkap: `docs/03-execution-plan.md`.

| Iterasi | Task | Fokus | Estimasi | Status |
|---------|------|-------|----------|--------|
| **Iterasi 1 — MVP Core** | T1.1–T1.15 | Fondasi, Auth/RBAC, KRS flow, nilai dasar, import, audit, waiting room MVP, load test, staging | ~39 hari kerja | 🟢 **T1.1–T1.10 selesai**; 🟢 **T1.11 TUNTAS** (`91ecf05`→`6233e37`→`8c3f2c4`→`4e77700`→ci `2dcfa4b`); 🟢 **T1.12 TUNTAS** (`9a7c1d1`); 🟢 **T1.13 TUNTAS** (`d60e6c7`); 🟢 **T1.14 SELESAI** (load test k6; DL-27, DL-28); 🟢 **T1.15 SELESAI** (docker-compose.prod.yml, nginx.prod.conf, SSL, zero-downtime deploy, deploy-staging.sh, docs/deployment-staging.md) |
|| **Iterasi 2 — Keuangan & Transkrip** | T2.1–T2.7 | Tagihan otomatis, SPP, gate lunas, transkrip PDF/Excel, notifikasi KRS, E2E | ~16 hari | 🟢 **T2.1 SELESAI** (payment service + generate 2004 tagihan; `e354550`); 🟢 **T2.2 SELESAI** (update status admin keuangan); 🟢 **T2.3 SELESAI** (KRS gate `can_access_krs`); 🟢 **T2.6 SELESAI** (MyPaymentPage + FinancePaymentsPage; `4e2db04`); 🟢 **T2.4 SELESAI** (transkrip PDF pdfkit + Download PDF frontend; `dd68337`); 🟢 **T2.5 SELESAI** (notifikasi KRS: email nodemailer + in-app, retry 3×, halaman `/notifikasi` + badge unread); 🟢 **T2.7 SELESAI** (E2E bayar→KRS→nilai→transkrip; 12 test --runInBand PASS) |
||| **Iterasi 3 — Dosen Mengajar** | T3.1–T3.8 | Pilih MK, jadwal, absensi, bimbingan, substitute, nilai detail | ~20 hari | 🟢 **T3.1 SELESAI** (Dosen Pilih MK + migration + 8 test); 🟢 **T3.2 SELESAI** (Jadwal Kelas + Ketersediaan + 7 test); 🟢 **T3.3 SELESAI** (Absensi + QR check-in + 38 test, coverage modul ≥80% branch); 🟢 **T3.4 SELESAI** (Bimbingan Wali + 41 test, coverage modul 89.36% branch); 🟢 **T3.5 SELESAI** (Substitute Teaching + 21 test, global branch 80.12%); 🟢 **T3.6 SELESAI** (Nilai Detail: remedial per komponen max(asli,remedial), 37 test, global branch 80.18%); 🟢 **T3.7 SELESAI** (Dashboard Dosen frontend: 6 tab Pilih MK/Jadwal/Absensi/Bimbingan/Substitute/Nilai, 83 frontend test, bundle 95.59 kB gzip); 🟢 **T3.8 SELESAI** (Integrasi 6 tab ke API nyata — backend mikro + frontend full redesign, 129 frontend test, 585 backend test, semua gate hijau, commit `37c5d9d`) |
|| **Iterasi 4 — Skala & Integrasi** | T4.1–T4.7 | Waiting room production, payment gateway, PDDikti, payroll detail, security audit | ~23 hari | 🟢 **T4.1–T4.7 SELESAI** (2026-08-08 s.d. 2026-08-09): T4.1 Waiting Room Hardening (Lua atomic threshold) ✅; T4.2 Payment Gateway Adapter (Midtrans/Xendit mock + webhook idempotent) ✅; T4.3 PDDikti Sync (scheduled job, upsert, idempotent) ✅; T4.4 Payroll Detail (Honor Tetap + Sesi + Substitute + Bimbingan) ✅; T4.5 Load Test Production (5.5k users, 1.8k kelas, queue mode verified) ✅; T4.6 Monitoring Dashboards (Prometheus metrics + 5 Grafana dashboards) ✅; T4.7 Security Audit (node-pg-migrate 7.9.0 vuln fix, lint clean, npm audit prod 0) ✅ |
|| **Iterasi 5 — UX & Polish** | T5.1–T5.7 | Login andal, error inline, RBAC UI, aksesibilitas, E2E | ~16 hari | 🟢 **T5.1–T5.7 SELESAI** (2026-08-09): T5.1 Login Reliability (NetworkError, timeout, retry transien, session recovery) ✅; T5.2 Error Inline Standardization (FormAlert/FieldError di 10 halaman) ✅; T5.3 RBAC UI Consistency (menu disaring dari permission — fix 403 admin keuangan, sembunyikan dead-end, hapus route duplikat) ✅; T5.4 UI/UX Polish (normalisasi palet gray→slate/blue→primary, komponen Spinner bersama) ✅; T5.5 Accessibility Audit (**Lighthouse accessibility 100/100**, 14 button type, aria-describedby) ✅; T5.6 Performance Polish (code splitting 13 chunk, bundle 92.8 kB gzip <200 kB) ✅; T5.7 E2E Playwright (**9 test: login + bayar + KRS+PDF + transkrip + absensi/nilai dosen, CI gate**) ✅. Plus penutupan keluhan lama: notifikasi "tandai baca semua" + KRS PDF download. |

| **Total:** ~24 minggu (buffer 30%), asumsi 1 developer full-time.

---

## Iterasi 6 — Produksi PaaS, Polish & Master Data (2026-08-10 s.d. 2026-08-16)

| Area | Status | Keterangan |
|------|--------|------------|
| Hosting produksi | ✅ **DIPUTUSKAN & LIVE** | FE **Vercel** (`https://siak-vercel.vercel.app`), BE **Render** (`https://siak-backend.onrender.com`), **Neon** PostgreSQL (pooled, 18 migrasi), **Upstash** Redis (DL-35). Runbook: `docs/deployment-paas-free.md`. Backend perlu manual deploy ulang setelah env diubah; FE deploy via `vercel --prod --yes` dari root repo. |
| Admin Sistem menu | ✅ **SELESAI** | Menu dibatasi 4 item: **Dashboard, User, Master Data, Informasi Penting** (DL-36). |
| CRUD Fakultas & Prodi | ✅ **SELESAI** | `GET/POST/PUT/DELETE /admin-master/faculties` & `/prodis` + tab di halaman Master Data (Admin Sistem). |
| Modul Announcements (Informasi Penting) | ✅ **SELESAI** | Migration `V20260815_018__create_announcements.sql`; CRUD + `GET /active` (route sebelum `/:id`); kartu announcement di Dashboard semua role; halaman `AnnouncementPage` + 6 test (DL-36). |
| **Master Data Mahasiswa & Dosen** | ✅ **SELESAI** | Tab **Mahasiswa** & **Dosen** di `AdminMasterPage` (sebelumnya hanya Fakultas/Prodi — tab hilang karena FE belum diimplementasikan, backend sudah ada). List `GET /admin-master/students\|lecturers` (limit 100, filter prodi/search), create manual (password default NIM/NIDN); edit/nonaktifkan via UI disabled karena backend PUT belum ada (DL-40). 13 test. |
| Pilih MK (Dosen) | ✅ **SELESAI** | Toggle **grid/list** + MK berstatus `selection_status !== 'belum_diajukan'` dibuat **non-selectable** & tampil di section "Mata Kuliah Sudah Diajukan". |
| Fix "Gagal memuat data" | ✅ **SELESAI** | `getAvailableCourses` & `getSubstituteRequests` double-unwrap `{items:[]}` → `rows.map is not a function`; `getAcademicClasses` path `/academic/classes` → `/classes` (DL-37). |
| RBAC Admin Akademik | ✅ **SELESAI** | Link "Isi KRS" hanya untuk role `mahasiswa`; menu Transkrip disembunyikan dari Admin Akademik (`HIDDEN_MENU_BY_ROLE`). |
| Bimbingan searchable | ✅ **SELESAI** | Dropdown "Pilih Mahasiswa Binaan" searchable (NIM/nama/email/prodi) + filter catatan 8 kolom; backend `SESSION_SELECT` join `users`(email) & `prodis`(code). |
| Login NIM/NIK | ✅ **SELESAI** | Resolver UNION ALL prioritas email > NIM > NIK > NIDN + LIMIT 1 (deterministik); mahasiswa=NIM, dosen=NIK, password default NIM/NIK + `must_change_password` (DL-39). |
| Migrasi Neon | ✅ **SELESAI (18)** | Migration `V018` announcements dijalankan manual ke Neon produksi via `node-pg-migrate up` dari lokal (DATABASE_URL pooled). |
| CI/CD | ✅ **HIJAU** | GitHub Actions Node 24; lint max-warnings 0, prettier, typecheck, build, coverage FE branch ≥80% (exclude `App.tsx` + `api.ts`, DL-38), BE lines/branches ≥75%. |

---

## Keputusan Kunci (ringkas — lengkap di `docs/decision-log.md`)

- Proyek baru **Siak** di `C:\Users\ratih\source\repos\Siak`; PRD SIAKAD V2 = sumber kebutuhan; iterasi lama (Siakad/_V2/_V3) tidak dibawa (DL-01).
- **Skala:** puncak **5.000 simultan** (AC-01/NF-06); ±2.000 mahasiswa, ±100 dosen, admin ±5 per peran.
- **Stack:** Node.js 22 + TypeScript + Express; React 18 + Vite + Tailwind; PostgreSQL 16; Redis 7; Socket.io; Docker + Nginx; GitHub Actions; Prometheus/Grafana/Loki (DL-02 s.d. DL-07).
- **Arsitektur:** monolith modular, stateless backend, audit & atribusi built-in, adapter untuk integrasi eksternal (DL-07, DL-10, DL-12).
- **Revisi PRD:** Dosen Wali read-only; approval KRS hanya **Admin Akademik** (berbasis pelunasan SPP); tanpa daftar tunggu; KRS terkunci setelah submit; ditolak → revisi selama periode (DL-09).
- **Peran:** Mahasiswa, Dosen (Wali = atribut), Admin Akademik, Admin Keuangan, Admin Sistem (superuser) — 5 tipe akun (DL-08).
- **Nilai:** bobot tugas 20 / UTS 30 / UAS 50; skala A=4.0 s.d. E=0 dengan plus/minus; remedial ambil nilai tertinggi; matkul diulang → nilai lama digantikan; IPK standar kampus Indonesia; nilai langsung tampil tanpa approval (DL-10).
- **Keuangan:** 1 tagihan/semester, otomatis awal semester, nominal per angkatan; SPP Ganjil Rp 970.000 / Genap Rp 950.000; partial diperbolehkan, **harus lunas penuh** maksimal 1 minggu sebelum akhir periode KRS; tidak lunas → tidak bisa KRS (tanpa denda saat ini) (DL-12).
- **Waiting room:** ambang **default 5.000, configurable**, dikalibrasi lewat load test (DL-11 — menggantikan rekomendasi ±2.000 di docs/00 yang ditulis sebelum skala nyata dikonfirmasi).
- **Dosen:** pilih MK sesuai prodi; ketersediaan jadwal = checklist dari jadwal admin; absensi wajib input materi dulu; bimbingan = catatan pertemuan; substitute teaching tanpa approval + akses penuh halaman dosen yang diganti; payroll: input Admin Keuangan, visibilitas dosen bersangkutan + admin keuangan, **detail perhitungan TBD** (DL-14).
- **Non-negotiable:** login andal, error inline, kode bersih (lint/test ≥80%/review), RBAC jelas, atribusi "diinput oleh X" di UI (DL-17).
- **Hosting:** VPS/cloud kemungkinan besar; deployment-ready Docker; keputusan final + admin teknis menyusul (DL-18).
- **Integrasi:** impor Excel/CSV sekarang; payment gateway & PDDikti iterasi 4 (DL-12, DL-13).
- **T1.1 (DL-19):** gate APPROVE SPECIFICATION ditafsirkan approval implisit (perlu konfirmasi pemilik); Vitest 3 untuk frontend; health check liveness + readiness; port dev 5433/6380 (konflik container lama).

---

## Open Items (untuk dikonfirmasi pemilik)

1. **APPROVE SPECIFICATION** untuk docs/02 + docs/03 — ✅ **DIBERIKAN 2026-08-01 (Tugas #2)**. Syarat #1 reviewer untuk lanjut T1.2: **TERPENUHI**.
2. ~~Repo git + remote GitHub belum diinisialisasi~~ — ✅ **SELESAI** (CI GitHub Actions aktif & hijau).
3. Siapa admin teknis (user sendiri vs tim IT kampus)?
4. Format file impor data lama (Excel/CSV) — struktur kolom belum dipastikan.
5. ~~Payroll: skema perhitungan honor~~ — ✅ diimplementasikan T4.4 (Honor Tetap + Sesi + Substitute + Bimbingan).
6. Denda keterlambatan pembayaran (saat ini tanpa denda, akan di-update user).
7. **Visibilitas Dosen Wali terhadap transkrip/IPK binaan** — asumsi Analyst (docs/02 §15 #4); perlu konfirmasi sebelum implementasi Iterasi 1.
8. Kanal notifikasi KRS otomatis (email/WA/Telegram).
9. **Login NIM/NIK vs email** — F-01 menyebut "NIM/kredensial unik"; implementasi saat ini email-only (email institusi = kredensial unik). Keluhan lama (`list perbaikan.txt`) meminta login default NIM/NIK. Perlu keputusan pemilik.

---

## Risiko Terpantau

- Payroll detail TBD → implementasi minimal dulu (F-26), detail Iterasi 4 (T4.4).
- Waiting room 5k simultan perlu load test bertahap (k6) — T1.14, T4.5; ambang configurable (DL-11).
- RBAC 5 tipe akun + atribut Wali → matriks hak akses di docs/02 §6.1 wajib di-review sebelum coding; 1 test per sel matrix (T1.4).
- Integrasi eksternal (payment gateway, PDDikti) → adapter pattern, mock dulu.
- **Repo git belum ada** → handoff Developer T1.2 tertunda; mitigasi: inisialisasi repo + remote oleh pemilik sebelum Developer mulai.
- **Gate APPROVE SPECIFICATION** — ✅ diberikan 2026-08-01 (Tugas #2); T1.2 bisa start setelah repo ready.

---

## Langkah Selanjutnya (Brief Tahap Berikutnya)

1. **Pemilik (manual, F-31):** Inisialisasi repo git + remote GitHub di `C:\Users\ratih\source\repos\Siak` — **PREREQUISITE** untuk T1.2 (CI butuh remote).
2. **Developer:** Setelah repo ready → lanjut **T1.2** (migrasi DB + seed) lalu T1.3–T1.15 sesuai `docs/03-execution-plan.md` & quality gates (`docs/03` §8). Sebelum T1.11, pasang coverage threshold frontend ≥80% (finding `docs/05` FIND-04).
3. **Reviewer:** Re-verifikasi checklist ada di `docs/05-review-report.md` §7 — mulai review T1.2 setelah Developer selesai.
4. **Gate release:** Approval manual pemilik sebelum produksi.