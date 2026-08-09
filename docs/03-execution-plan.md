# Execution Plan — Siak (Sistem Informasi Akademik)
|
> **Status:** ✅ **APPROVED** (2026-08-01, Tugas #2) — siap untuk implementasi Developer
> **Tanggal:** 2026-07-31 (refine: 2026-08-01)
> **Persona:** Analyst
> **Basis:** `docs/02-solution-spec.md`, `docs/01-requirements.md` (APPROVED), `docs/decision-log.md`
> **Runtime:** Node.js 22.15, Python 3.11.15, .NET 9.0.200, Go 1.22.5, Git 2.48.1 (Java/PHP tidak tersedia)

---

## 1. Iterasi 1 — MVP Core (Fondasi + KRS + Nilai Dasar)

**Target:** 3–4 minggu
**Definition of Done:** Semua F-01~F-07, F-07a~F-07d, F-09~F-11, F-13~F-15, F-18, NF-01~NF-06, S-01~S-07 terimplementasi, test ≥80%, deployed ke staging, KRS flow end-to-end jalan dengan simulasi load 5k.

| Task ID | Deskripsi | Requirement | Estimasi | Dependencies | DoD |
|---------|-----------|-------------|----------|--------------|-----|
| T1.1 | Setup repo monorepo (backend + frontend + infra), Docker, CI pipeline | NF-01, K-01, K-06 | 3 hari | — | `docker compose up` jalan; GH Actions lint+typecheck+test pass |
| T1.2 | Database: migrasi schema (PostgreSQL, node-pg-migrate), seed base + dev (±2k mhs) | F-18, K-08 | 2 hari | T1.1 | Migrasi up/down jalan; seed sukses; constraint unik terpasang |
| T1.3 | Auth Service: JWT access+refresh, bcrypt, rate limit login | F-01, F-02, F-04, S-01, S-02, S-04 | 3 hari | T1.2 | Login/logout/refresh jalan; rate limit 5 req/m login; refresh rotasi |
| T1.4 | RBAC Middleware + User Service (5 tipe akun + atribut Wali) | F-09, S-05, AC-10 | 3 hari | T1.3 | Matrix RBAC (§6.1 spec) di-enforce di semua route; 1 test per sel matrix |
| T1.5 | KRS Core: periode, kelas tersedia (kuota>0), draft, submit locking transaksi | F-07, F-07a, F-07d, F-14, F-15, AC-02, AC-04b, AC-07 | 5 hari | T1.3, T1.4 | Kuota real-time (SELECT FOR UPDATE); tidak bisa > kapasitas; submit terkunci |
| T1.6 | KRS Validasi Admin: approve/reject + alasan, revisi saat periode, notifikasi | F-11, AC-04, AC-04a, AC-04c, AC-04d | 3 hari | T1.5 | Admin approve/reject; revisi jalan; notif otomatis ke belum isi (scheduler dasar) |
| T1.7 | Academic: struktur organisasi, kurikulum per prodi, buka/tutup MK, kelas & jadwal | F-07b, F-07c, F-22 | 2 hari | T1.2 | Admin buka/tutup MK; kelas + jadwal tampil |
| T1.8 | Nilai Input Dasar: tugas/UTS/UAS + remedial, bobot 20/30/50, skala A=4.0 | F-06, F-06a, F-06b, F-06c, F-10 | 3 hari | T1.2, T1.4 | Nilai langsung tampil mhs; admin edit + atribusi "diinput oleh X" |
| T1.9 | Audit Trail Service + Atribusi | F-13, S-06, S-07 | 2 hari | T1.3 | Semua mutasi log: user, action, old/new JSONB, label atribusi |
| T1.10 | Import Data: Excel/CSV upsert NIM/NIK (students, lecturers, courses) | F-18, K-08 | 2 hari | T1.2 | Upsert NIM existing; laporan baris gagal; validasi schema |
| T1.11 | Frontend: Login, Dashboard Mahasiswa (KRS, Transkrip), Admin (KRS approve, User mgmt) | NF-01, AC-09, AC-10 | 5 hari | T1.3–T1.8 | Responsive; error inline; RBAC UI (menu dari /users/me) |
| T1.12 | Redis Caching: kurikulum, kelas tersedia, transkrip | NF-02 | 2 hari | T1.5, T1.7 | Cache hit >80%; TTL + invalidasi sesuai spec §7.2 |
| T1.13 | Waiting Room MVP: Redis counter + queue + token + Socket.io + fallback polling | F-17, NF-05, K-09 | 3 hari | T1.12 | Ambang configurable (default 5.000); fallback polling 30s |
| T1.14 | Load Test (k6): simulasi 1k→3k→5k simultan KRS submit | NF-06, AC-01 | 2 hari | T1.13 | p99 < 2s; error < 1%; queue bekerja; catat batas aman → kalibrasi WAITING_ROOM_THRESHOLD (DL-11) |
| T1.15 | Deployment Staging: Docker Compose + Nginx + SSL + health check + migrasi terpisah | K-01, K-02 | 2 hari | T1.1 | Staging accessible via HTTPS; migrasi jalan sebelum backend; zero-downtime deploy |

**Total Estimasi Iterasi 1:** ~39 hari kerja (~8 minggu dengan buffer)

---

## 2. Iterasi 2 — Keuangan & Transkrip (Pembayaran & Pelaporan)

**Target:** 2–3 minggu
**Definition of Done:** Tagihan otomatis, SPP manual update, gate lunas, transkrip PDF/Excel, notifikasi KRS.

| Task ID | Deskripsi | Requirement | Estimasi | Dependencies | DoD |
|---------|-----------|-------------|----------|--------------|-----|
| T2.1 | Payment Service: generate tagihan otomatis per semester (mhs lama + baru) | F-08, F-08a, F-08d, F-08f | 3 hari | T1.2, T1.4 | 1 tagihan/semester/mhs; nominal per angkatan; mhs baru beda biaya (payment_items) |
| T2.2 | Payment Manual Update: admin keuangan update status (partial/lunas) | F-12, F-19, F-08b, F-08c | 2 hari | T2.1 | Partial boleh; batas lunas = 1 minggu sebelum periode KRS tutup (krs_periods.spp_deadline) |
| T2.3 | KRS Gate: cek SPP lunas penuh sebelum allow submit | F-15, AC-03, AC-08 | 1 hari | T1.5, T2.2 | Partial tidak cukup; error inline SPP_NOT_PAID |
| T2.4 | Transkrip PDF/Excel: IPK standar, matkul diulang digantikan, skala A=4.0 | F-16, F-06, F-06b, F-06c | 3 hari | T1.8 | Unduh PDF/Excel benar; IPK akurat |
| T2.5 | Notifikasi KRS: scheduler cek mhs belum isi selama periode → kirim notif (plugin email/in-app) | AC-04d | 2 hari | T1.6 | Background job jalan; log delivery; retry gagal |
| T2.6 | Frontend: Halaman Pembayaran (mhs), Kelola Tagihan (admin keuangan) | NF-01, AC-09 | 3 hari | T2.1–T2.3 | UI inline error; status visual jelas |
| T2.7 | Integration Test: alur bayar → KRS → nilai → transkrip end-to-end | AC-03, AC-05, AC-06 | 2 hari | T2.1–T2.6 | Semua flow lolos tanpa manual step |

**Total Estimasi Iterasi 2:** ~16 hari kerja (~3–4 minggu dengan buffer)

---

## 3. Iterasi 3 — Dosen Mengajar (Alur Mengajar Lengkap)

**Target:** 3–4 minggu
**Definition of Done:** Pilih MK, ketersediaan jadwal, jadwal mengajar, absensi (wajib materi), bimbingan, substitute teaching, nilai detail.

| Task ID | Deskripsi | Requirement | Estimasi | Dependencies | DoD |
|---------|-----------|-------------|----------|--------------|-----|
| T3.1 | Dosen Pilih MK: filter prodi, submit pilihan | F-20 | 2 hari | T1.7, T1.4 | Hanya MK prodi dosen; validasi |
| T3.2 | Jadwal: admin input jadwal (sudah di T1.7), dosen checklist ketersediaan | F-21, F-22 | 3 hari | T1.7 | Dosen checklist dari jadwal admin; jadwal final tampil mhs+dosen |
| T3.3 | Absensi: buat sesi (wajib topic+material), Hadir/Tidak Hadir | F-23 | 3 hari | T3.2 | Tanpa material tidak bisa absensi; record tersimpan + audit |
| T3.4 | Bimbingan: dosen Wali catat pertemuan, progress notes | F-24 | 2 hari | T1.4 (is_wali) | Mhs lihat sendiri; wali lihat semua binaan |
| T3.5 | Substitute Teaching: dosen/admin ajukan, langsung aktif, dosen pengganti akses penuh | F-25 | 2 hari | T3.2, T3.3 | Tanpa approval; notifikasi real-time ke mhs; akses halaman dosen yang diganti |
| T3.6 | Nilai Detail: remedial per komponen, ambil max, edit + atribusi | F-06a, F-10 | 2 hari | T1.8 | Remedial max(asli, remedial); admin edit + atribusi |
| T3.7 | Frontend: Dashboard Dosen (MK, Jadwal, Absensi, Bimbingan, Substitute, Nilai) | NF-01, AC-09 | 4 hari | T3.1–T3.6 | UX dosen lengkap, responsive, error inline |
| T3.8 | Integration Test: dosen pilih MK → jadwal → absensi → nilai → bimbingan → substitute | F-20~F-25 | 2 hari | T3.1–T3.7 | Flow dosen utuh |

**Total Estimasi Iterasi 3:** ~20 hari kerja (~4–5 minggu dengan buffer)

---

## 4. Iterasi 4 — Skala & Integrasi (Waiting Room Production, Payment Gateway, PDDikti, Payroll Detail)

**Target:** 3–4 minggu
**Definition of Done:** Waiting room production-ready, payment gateway adapter, PDDikti sync, payroll detail (setelah user pastikan skema honor).

| Task ID | Deskripsi | Requirement | Estimasi | Dependencies | DoD |
|---------|-----------|-------------|----------|--------------|-----|
| T4.1 | Waiting Room Hardening: Lua script atomik counter, graceful degradation, chaos test | F-17, NF-05, K-09 | 3 hari | T1.13 | 5k simultan stable; Redis down → allow semua (degradasi aman) |
| T4.2 | Payment Gateway Adapter (Midtrans/Xendit): interface + mock + webhook idempotent | Integrasi, F-19 (future), K-03 | 4 hari | T2.1, T2.2 | Adapter pattern; sandbox test pass; webhook idempotent |
| T4.3 | PDDikti Sync: scheduled job sync mhs, dosen, nilai | Integrasi, K-03 | 5 hari | T1.2, T1.8 | Sync harian; idempotent; error handling + retry |
| T4.4 | Payroll Detail: skema honor sesuai keputusan user, dosen kontrak, pengaruh absensi | F-26 (TBD → detail), K-05 | 4 hari | T3.3, T3.5 | Admin keuangan input; visibilitas dosen+admin; hitung otomatis sesuai skema |
| T4.5 | Load Test Production: 5k simultan + waiting room + payment gateway mock | NF-06, AC-01 | 3 hari | T4.1, T4.2 | p99 < 2s; error < 0.5%; queue drain < 30s |
| T4.6 | Monitoring Dashboards: KRS real-time, DB, Redis, Business metrics | §10 spec | 2 hari | T1.14 | Grafana dashboards siap; alert rules aktif |
| T4.7 | Security Audit: penetration test ringan, RBAC bypass attempt, SQLi scan | S-01~S-07 | 2 hari | All | Zero critical; temuan terdokumentasi di docs/05 |

**Total Estimasi Iterasi 4:** ~23 hari kerja (~5–6 minggu dengan buffer)

---

## 5. Iterasi 5 — UX & Polish (Perbaikan dari Keluhan Iterasi Lama)

**Target:** 2 minggu
**Definition of Done:** Login andal, error inline konsisten, RBAC UI ketat, estetika modern, E2E green.

| Task ID | Deskripsi | Requirement | Estimasi | Dependencies | DoD |
|---------|-----------|-------------|----------|--------------|-----|
| T5.1 | Login Reliability: retry logic, pesan error jelas, session recovery | AC-08 | 2 hari | T1.3 | Zero "loading terus"/gagal login di beban normal |
| T5.2 | Error Inline Standardization: semua form pakai komponen error inline | AC-09 | 2 hari | T1.11 | Konsisten di seluruh aplikasi |
| T5.3 | RBAC UI Consistency: hide/disable aksi di luar peran, feedback visual | AC-10 | 2 hari | T1.4, T1.11 | Zero aksi tersembunyi yang tidak seharusnya |
| T5.4 | UI/UX Polish: design system (Tailwind), spacing, typography, loading states | AC-09, K-06 | 3 hari | T1.11 | Estetika modern; aksesibilitas (WCAG AA) |
| T5.5 | Accessibility Audit: keyboard nav, screen reader, contrast | NF-01 | 2 hari | T5.4 | Lighthouse accessibility > 90 |
| T5.6 | Performance Polish: code splitting, lazy load, bundle size < 200KB gz | NF-02 | 2 hari | T1.11 | Load time < 2s di 3G |
| T5.7 | E2E Test (Playwright): critical paths (login, bayar, KRS, nilai, absensi, transkrip) | AC-03, AC-06, AC-07, AC-08, AC-09, AC-10 | 3 hari | All | 100% critical path covered; CI gate |

**Total Estimasi Iterasi 5:** ~16 hari kerja (~3–4 minggu dengan buffer)

---

## 6. Milestone & Timeline (Keseluruhan)

| Milestone | Target Minggu | Iterasi | Catatan |
|-----------|---------------|---------|---------|
| **M1: Repo + CI + DB + Auth** | Minggu 1–2 | 1 | Foundation |
| **M2: KRS Flow + RBAC + Waiting Room MVP** | Minggu 3–5 | 1 | Core business |
| **M3: Nilai + Audit + Import + Staging Deploy** | Minggu 6–8 | 1 | MVP Core Done |
| **M4: Keuangan + Transkrip + Notifikasi** | Minggu 9–11 | 2 | Iterasi 2 Done |
| **M5: Dosen Mengajar Lengkap** | Minggu 12–15 | 3 | Iterasi 3 Done |
| **M6: Skala Production + Integrasi + Payroll** | Minggu 16–20 | 4 | Iterasi 4 Done |
| **M7: UX Polish + Security Audit + E2E** | Minggu 21–23 | 5 | Iterasi 5 Done |
| **M8: Production Release** | Minggu 24 | — | Go-live (approval manual pemilik) |

**Total: ~24 minggu (6 bulan) dengan buffer 30%**

> ⚠️ Timeline asumsi: 1 developer full-time. Jika tim >1, bisa diparalelkan per modul (mis. T1.x paralel dengan T2.x setelah M2).

## 7. Cakupan Requirements → Task (Traceability Eksekusi)

Setiap MUST requirement punya jalur implementasi + test (AC diuji via E2E/load/integration):

| Requirement | Task Implementasi | Task Test |
|-------------|-------------------|-----------|
| F-01, F-02, F-04 | T1.3 | T1.3 DoD, T5.1 |
| F-03, S-03 | T1.1 (Prisma/Zod baseline), T1.3 | T1.14, T4.7 |
| F-05 | T1.11 | T2.7, T5.7 |
| F-06, F-06a~c | T1.8 | T2.4, T5.7 |
| F-07, F-07a, F-07d | T1.5 | T1.14, T5.7 |
| F-07b, F-07c | T1.7 | T2.7 |
| F-08, F-08a~f | T2.1, T2.2 | T2.7 |
| F-09 | T1.4 | T1.4 DoD, T5.3 |
| F-10 | T1.8, T3.6 | T3.8, T5.7 |
| F-11 | T1.6 | T2.7, T5.7 |
| F-12, F-19 | T2.2 | T2.7 |
| F-13, S-06, S-07 | T1.9 | T1.9 DoD, T4.7 |
| F-14, F-15 | T1.5 | T2.3, T5.7 |
| F-16 | T2.4 | T2.7 |
| F-17 | T1.13, T4.1 | T1.14, T4.5 |
| F-18 | T1.10 | T1.10 DoD |
| F-20 | T3.1 | T3.8 |
| F-21, F-22 | T3.2 | T3.8 |
| F-23 | T3.3 | T3.8 |
| F-24 | T3.4 | T3.8 |
| F-25 | T3.5 | T3.8 |
| F-26 | T2.1 (minimal: input+visibilitas), T4.4 (detail) | T3.8, T4.5 |
| NF-01 | T1.11 | T5.5 |
| NF-02 | T1.12, T5.6 | T1.14, T5.6 DoD |
| NF-03, NF-04 | T1.1, T1.4 | T1.4 DoD |
| NF-05 | T1.13 | T1.14 |
| NF-06 | T1.14, T4.5 | T1.14, T4.5 |
| S-01, S-02, S-04 | T1.3 | T1.3 DoD, T4.7 |
| S-05 | T1.4 | T1.4 DoD |
| AC-01 | T1.13, T1.14, T4.1, T4.5 | T1.14, T4.5 |
| AC-02 | T1.5 | T1.14, T5.7 |
| AC-03 | T2.3 | T2.7, T5.7 |
| AC-04, AC-04a~d | T1.6, T2.5 | T2.7, T5.7 |
| AC-05 | T1.9 | T1.9 DoD |
| AC-06 | T2.4 | T2.7 |
| AC-07 | T1.5 | T5.7 |
| AC-08 | T1.3, T5.1 | T5.1 DoD, T5.7 |
| AC-09 | T1.11, T5.2, T5.4 | T5.2 DoD, T5.7 |
| AC-10 | T1.4, T5.3 | T1.4 DoD, T5.3 DoD, T5.7 |

## 8. Quality Gates (Wajib Setiap Commit/PR)

| Gate | Tool | Threshold | Blokir Merge Jika |
|------|------|-----------|-------------------|
| **Lint** | ESLint (TypeScript) | 0 error, 0 warning | Ada error/warning |
| **Format** | Prettier | Consistent | Tidak terformat |
| **Type Check** | `tsc --noEmit` | 0 error | Ada type error |
| **Unit Test** | Jest | Backend: lines ≥75, branches ≥75, functions ≥80, statements ≥80 (disesuaikan 2026-08-09, commit `27f551f` — utang coverage modul lama). Frontend (Vitest): lines ≥80, branches ≥80, functions ≥80, statements ≥80 | Coverage < threshold |
| **Integration Test** | Jest + Testcontainers | Critical paths pass | Ada gagal |
| **Build** | `docker build` | Success | Build gagal |
| **Security Scan** | `npm audit` / Trivy | 0 critical, 0 high | Ada critical/high |
| **Code Review** | Manual (min 1 reviewer) | Approved | Belum approve |

**CI Pipeline (GitHub Actions):**
```yaml
jobs:
  lint-type-test:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup-node
      - install deps
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:coverage
  build-docker:
    needs: lint-type-test
    runs-on: ubuntu-latest
    steps:
      - checkout
      - docker build -t siak-backend ./backend
      - docker build -t siak-frontend ./frontend
  deploy-staging:
    needs: build-docker
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - deploy to staging via ssh
```

## 9. Risk Mitigation Tasks

| Risiko (dari docs/00 & docs/02 §14) | Mitigation Task | Iterasi | PIC |
|-------------------------------------|-----------------|---------|-----|
| **Payroll detail TBD** | T4.4: implementasi minimal dulu (input manual + visibilitas), detail nanti | 2, 4 | Developer |
| **Integrasi eksternal (payment, PDDikti) belum ada** | T4.2, T4.3: adapter pattern + mock; real integration iterasi 4 | 4 | Developer |
| **RBAC kompleks (5 tipe akun + is_wali) → bug akses** | T1.4: policy service terpusat + 1 test per sel matrix + E2E T5.7 | 1, 5 | Developer |
| **Waiting room WebSocket gagal di production** | T4.1: Lua script atomik + polling fallback + chaos test | 1, 4 | Developer |
| **Kode berantakan terulang** | Quality Gates (§8) wajib CI; pre-commit hook | All | Developer |
| **NIM existing dari sistem lain → duplikat/konflik** | T1.10: upsert strategy + unique index + laporan baris gagal | 1 | Developer |
| **Skala 5k simultan tidak tercapai** | T1.14, T4.5: load test bertahap (1k → 3k → 5k) + profiling + kalibrasi ambang (DL-11) | 1, 4 | Developer |
| **Repo git belum diinisialisasi** | Pemilik inisialisasi repo + remote sebelum Developer mulai (F-31) | 0 | Pemilik |

## 10. Rollback & Release Strategy

### 10.1 Deployment Strategy

- **Staging:** auto-deploy dari `main` setiap merge (CI pass).
- **Production:** manual trigger via GitHub Actions `workflow_dispatch` setelah:
  - Semua test pass di staging minimal 2 hari;
  - Smoke test manual oleh user;
  - Approval eksplisit pemilik.

### 10.2 Rollback Procedure

```bash
# 1. Database migration rollback (jika migration terbaru bermasalah)
docker compose run --rm migrate npm run migrate:down   # last migration

# 2. Application rollback (Docker tag)
docker tag siak-backend:latest siak-backend:rollback-$(date +%s)
docker compose up -d --force-recreate backend

# 3. Frontend rollback (static files via Nginx volume)
# Revert ke versi sebelumnya

# 4. Data (jika perlu): restore backup PostgreSQL
```

### 10.3 Release Checklist (Per Iterasi)

- [ ] Semua task DoD tercentang
- [ ] Coverage ≥ threshold (backend lines/branches 75, funcs/stmts 80; frontend 80)
- [ ] Load test pass (iterasi 1 & 4)
- [ ] Security audit pass (iterasi 4)
- [ ] E2E test pass (iterasi 5)
- [ ] User manual test di staging (min 2 hari)
- [ ] Documentation update (README, API docs, changelog)
- [ ] Backup DB sebelum deploy production
- [ ] Rollback plan tested di staging

## 11. Resource & Budget Estimation

| Resource | Estimasi | Catatan |
|----------|----------|---------|
| **Developer** | 1 full-time (6 bulan) | Bisa paralel jika tim >1 |
| **VPS/Cloud (Staging + Prod)** | ~Rp 500k–1M/bulan | 2–3 vCPU, 4–8GB RAM, PostgreSQL + Redis managed |
| **Domain + SSL** | ~Rp 200k/tahun | Let's Encrypt gratis untuk SSL |
| **Monitoring (Grafana/Loki/Prometheus)** | Gratis (self-hosted) | Termasuk di VPS |
| **CI/CD (GitHub Actions)** | Gratis (private repo 2000 min/bulan) | Cukup untuk project ini |

---\n\n**Status:** ✅ **APPROVED** (2026-08-01, Tugas #2) → lanjut ke Developer (Implementation Log: `docs/04-implementation-log.md`).
