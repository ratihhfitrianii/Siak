# Review Report — Siak (Sistem Informasi Akademik)

> **Tanggal:** 2026-08-01
> **Reviewer:** Independent Reviewer (Tugas #1)
> **Scope:** Review implementasi **T1.1** (Setup repo monorepo + Docker + CI) terhadap `docs/01-requirements.md` (APPROVED) dan `docs/02-solution-spec.md` (DRAFT — menunggu APPROVE SPECIFICATION)
> **Status Review:** CONDITIONALLY APPROVED

---

## 1. Ringkasan Review

### 1.1 Ruang Lingkup (Scope)
Review ini mengevaluasi **T1.1 — Setup repo monorepo (backend + frontend + infra), Docker, CI pipeline** sebagaimana terdokumentasi di `docs/04-implementation-log.md` (Developer, 2026-08-01) terhadap:
- **Requirements approved** (`docs/01-requirements.md`): F-01–F-26, NF-01–NF-06, S-01–S-07, AC-01–AC-10
- **Solution Specification draft** (`docs/02-solution-spec.md`): Arsitektur, stack teknologi, API contract, RBAC matrix, skema data, security, skalabilitas
- **Execution Plan draft** (`docs/03-execution-plan.md`): Task breakdown, quality gates, traceability

### 1.2 Artefak yang Dieksamin
| Artefak | Versi | Status |
|---------|-------|--------|
| `docs/01-requirements.md` | 223 baris | ✅ APPROVED |
| `docs/02-solution-spec.md` | 777 baris | ⏳ DRAFT (menunggu APPROVE SPECIFICATION) |
| `docs/03-execution-plan.md` | 281 baris | ⏳ DRAFT (menunggu APPROVE SPECIFICATION) |
| `docs/04-implementation-log.md` | 229 baris | ✅ T1.1 selesai |
| `docs/decision-log.md` | 199 baris | ✅ 18 keputusan (DL-01–DL-19) |
| `docs/project-status.md` | 86 baris | ✅ Updated 2026-08-01 |

### 1.3 Kode Sumber yang Diverifikasi (Sampling)
- `backend/` — package.json, tsconfig, eslint, jest, Dockerfile, src/index.ts, src/app.ts, src/config/env.ts, src/modules/health/
- `frontend/` — package.json, vite.config.ts, tsconfig, eslint, Dockerfile, nginx.conf
- `infra/` — docker-compose.yml, docker-compose.prod.yml, nginx/nginx.conf, prometheus/, loki/, grafana/
- `.github/workflows/ci.yml` — CI pipeline

### 1.4 Cek yang Dieksekusi (Actual Results)
| # | Perintah | Hasil | Catatan |
|---|----------|-------|---------|
| 1 | `backend: npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage && npm run build` | ✅ 17 test pass; coverage 100/88.46/100/100 | ≥80% gate terpenuhi |
| 2 | `frontend: npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build` | ✅ 1 test pass; bundle 144 KB / 46 KB gzip | Lint/format/typecheck clean |
| 3 | `docker compose -f infra/docker-compose.yml config --quiet` | ✅ OK | Sintaks valid |
| 4 | `docker compose -f infra/docker-compose.yml up -d --build` | ✅ 4 container healthy | postgres:5433, redis:6380, backend:3000, frontend:8080 |
| 5 | `curl /api/v1/health` | ✅ 200 liveness | `{"status":"ok"}` |
| 6 | `curl /api/v1/health/ready` | ✅ 200 readiness | `{"db":"up","redis":"up"}` |
| 7 | `curl -I http://localhost:8080` | ✅ 200 nginx | SPA served |

---

## 2. Kepatuhan Requirement (Requirement Coverage)

### 2.1 Cakupan T1.1 terhadap Requirements (docs/01)
T1.1 adalah **fondasi infrastruktur** — belum menyentuh logika bisnis (auth, RBAC, KRS, nilai, dll). Oleh karena itu, **requirement fungsional (F-01–F-26) tidak diuji di T1.1** — ini sesuai rencana (DoD T1.1 hanya infrastruktur).

| Requirement | Relevansi T1.1 | Status | Bukti |
|-------------|----------------|--------|-------|
| NF-01 (Responsive) | Frontend stack (React+Tailwind) siap | ✅ Tercakup | Stack dipilih, komponen belum ada |
| NF-02 (Load time <2s, caching Redis) | Redis + caching strategy dirancang | ✅ Tercakup | Infra Redis ready, caching di T1.12 |
| NF-03 (RBAC) | RBAC middleware stub siap | ✅ Tercakup | Router `rbac` ada, implementasi T1.4 |
| NF-04 (Load balancer) | Nginx LB + rate limit di infra | ✅ Tercakup | `infra/nginx/nginx.conf` skonfigurasi |
| NF-05 (Waiting room) | Redis counter + Socket.io dirancang | ✅ Tercakup | Infra ready, implementasi T1.13 |
| NF-06 (Stabil 5k simultan) | Load test direncanakan T1.14 | ✅ Tercakup | k6 script akan dibuat T1.14 |
| S-01 (Hashing kredensial) | bcrypt di-deps backend | ✅ Tercakup | `package.json` backend include bcrypt |
| S-02 (Session timeout) | JWT 15m + refresh 7h dirancang | ✅ Tercakup | Spec §6.3, implementasi T1.3 |
| S-03 (Anti SQLi) | Prisma/Zod + pg parameterized | ✅ Tercakup | Deps ready, enforce di T1.2+ |
| S-04 (Rate limiting) | Nginx + express-rate-limit (Redis) | ✅ Tercakup | Nginx config ready, enforce T1.3 |
| S-05 (RBAC) | 5 tipe akun + is_wali dirancang | ✅ Tercakup | Spec §6.1, implementasi T1.4 |
| S-06 (Audit trail) | Audit service stub + JSONB schema | ✅ Tercakup | Router `audit` ada, implementasi T1.9 |
| S-07 (Atribusi) | Audit log include `input_by_label` | ✅ Tercakup | Schema `audit_logs` siap |
| K-01 (Deployment-ready VPS) | Docker Compose prod + health check | ✅ Tercakup | `docker-compose.prod.yml` valid |
| K-02 (Laptop tidak 24/7) | Stateless backend + managed DB | ✅ Tercakup | Arsitektur monolith modular |
| K-03 (Integrasi eksternal terbatas) | Adapter pattern dirancang | ✅ Tercakup | Spec §2.3, implementasi T4.2/T4.3 |
| K-04 (Skala 5k simultan) | Ambang waiting room 5k default | ✅ Tercakup | DL-11, env var configurable |
| K-05 (Payroll TBD) | F-26 minimal direncanakan | ✅ Tercakup | Spec §2.3, T2.1/T4.4 |
| K-06 (Kode bersih) | Quality gates CI wajib | ✅ Tercakup | `.github/workflows/ci.yml` + local pass |
| K-07 (RBAC kompleks) | Policy service dirancang | ✅ Tercakup | Spec §6.2, 1 test per sel matrix T1.4 |
| K-08 (NIM existing) | Upsert strategy + unique index | ✅ Tercakup | Spec §4.4, implementasi T1.10 |
| K-09 (WebSocket + fallback) | Socket.io + polling 30s | ✅ Tercakup | Spec §7.1, implementasi T1.13 |
| AC-01 (5k simultan) | Load test T1.14 | ✅ Tercakup | k6 scenario direncanakan |
| AC-08 (Login andal) | Retry logic + error handling T5.1 | ✅ Tercakup | Fondasi auth T1.3 |
| AC-09 (Error inline) | Zod validation + error envelope | ✅ Tercakup | Spec §5.1, implementasi T1.11 |
| AC-10 (RBAC konsisten) | Matrix §6.1 + UI dari `/users/me` | ✅ Tercakup | Spec, implementasi T1.4/T1.11 |

**Kesimpulan Cakupan:** T1.1 **memenuhi semua fondasi infrastruktur** yang dibutuhkan untuk memungkinkan implementasi requirement fungsional di T1.2–T1.15. Tidak ada requirement yang "terlewat" pada tahap ini — semua punya jalur implementasi di task berikutnya (traceability matrix di `docs/03` §7).

### 2.2 Cakupan T1.1 terhadap Solution Spec (docs/02)
| Spec Section | Item | Status | Catatan |
|--------------|------|--------|---------|
| §2.1 Prinsip Arsitektur | A-1 Monolith modular, A-2 Stateless, A-3 RBAC single source, A-4 Audit built-in, A-5 Integritas kuota DB, A-6 Adapter integrasi, A-7 Deployment-ready, A-8 Error inline | ✅ Tercakup | Semua prinsip tercermin di struktur kode & infra |
| §2.2 High-Level Architecture | Nginx LB, Waiting Room, 9 modul backend, PostgreSQL, Redis, Socket.io | ✅ Tercakup | `infra/` + `backend/src/modules/*` stubs |
| §2.3 Komponen | 11 komponen (Nginx, WR, Auth, RBAC, KRS, Akademik, Keuangan, Dosen, Audit, Notif, Import) | ✅ Tercakup | Router stub per modul ada |
| §3.1 Stack Teknologi | Node 22/TS/Express, React/Vite/Tailwind, PG16, Redis7, Socket.io, JWT/bcrypt, Zod, Prisma+node-pg-migrate, csv-parse/xlsx, pdfmake/exceljs, Jest+Testcontainers+k6+Playwright, GH Actions, Docker+Nginx, Prometheus/Grafana/Loki | ✅ Tercakup | Semua deps di package.json / infra config |
| §3.2 Alternatif | Python, Go, .NET, Java/PHP, MySQL, Microservices — rationale documented | ✅ Tercakup | DL-02–DL-07 |
| §4 Data Design | ERD, 24 tabel, index & constraint, migrasi node-pg-migrate, seed, upsert NIM | ✅ Tercakup | Spec lengkap, migrasi T1.2 |
| §5 API Contract | Base URL, Auth, Rate limit, Envelope success/error, Pagination, 80+ endpoint, WebSocket events | ✅ Tercakup | Spec lengkap, health endpoint implemented |
| §6 Keamanan | RBAC matrix (5 tipe + is_wali), Enforcement, Auth/session, Anti SQLi, Audit/atribusi, Proteksi data | ✅ Tercakup | Spec lengkap, deps ready |
| §7 Skalabilitas | Waiting room (ambang 5k), Caching strategy, LB & backend scaling | ✅ Tercakup | Spec lengkap, infra ready |

**Kesimpulan:** Spec **diterjemahkan dengan setia** ke struktur proyek. Tidak ada deviasi material pada T1.1.

---

## 3. Temuan (Findings)

### 3.1 Temuan Positif (Strengths)
| ID | Kategori | Deskripsi |
|----|----------|-----------|
| STR-01 | Arsitektur | Monorepo modular rapi, pemisahan concern jelas (backend/frontend/infra/docs), siap CI/CD |
| STR-02 | Quality Gates | CI pipeline lengkap (lint, format, typecheck, test, coverage ≥80%, build, docker build, security scan, deploy-staging placeholder) — **semua gate lulus lokal** |
| STR-03 | Health Check | Liveness + Readiness probe proper (DB/Redis dependency check, `not_configured` handled, fail-fast production env validation) |
| STR-04 | Security Baseline | Helmet, CORS, Pino structured logging, Zod env validation, no-console enforced, `.gitignore` excludes `.env*`, placeholder secrets only |
| STR-05 | Docker & Infra | Dev & prod compose valid, Nginx LB + SSL termination + rate limit + WebSocket proxy, Prometheus/Grafana/Loki config siap |
| STR-06 | Test Infrastructure | Backend: Jest + ts-jest + supertest (17 test, coverage ≥80%); Frontend: Vitest 3 (kompatibel Vite 6) + React Testing Library |
| STR-07 | Decision Logging | 19 keputusan terdokumentasi (DL-01–DL-19) dengan rationale & konsekuensi — mencegah "kode berantakan" iterasi lama |
| STR-08 | Traceability | Requirements → Spec → Plan → Task → Test matrix lengkap di `docs/03` §7 & §17 |

### 3.2 Temuan yang Perlu Perbaikan (Findings)

#### FIND-01 — MEDIUM — APPROVE SPECIFICATION Gate Ambiguity
- **Lokasi:** `docs/04-implementation-log.md` §1.1, `docs/project-status.md` Open Items #1
- **Requirement affected:** Process governance (F-31, pipeline gate)
- **Evidence:** `docs/02` dan `docs/03` masih berstatus **DRAFT — menunggu APPROVE SPECIFICATION**. Developer mencatat asumsi "approval implisit" dari instruksi pemilik "Implementasi sesuai docs/02 dan docs/03" dan melanjutkan T1.1.
- **Impact:** Jika pemilik **belum** bermaksud approve, ada risiko rework fondasi (meski T1.1 bersifat infrastruktur, rendah probabilitas breaking change). Ketidakjelasan gate menciptakan ambiguitas proses.
- **Reproduction:** Baca `docs/00` line 48 ("Pemilik: tulis APPROVE SPECIFICATION"), `docs/04` §1.1 asumsi #1.
- **Required correction:** Pemilik **harus** memberikan **APPROVE SPECIFICATION eksplisit** (tulis di `docs/00` atau `docs/project-status.md`) sebelum Developer melanjutkan T1.2+. Reviewer merekomendasikan **CONFIRM GATE** sebagai prasyarat lanjut.
- **Verification method:** Cek `docs/project-status.md` Open Items #1 → status "APPROVED" dengan tanggal & inisial pemilik.

#### FIND-02 — LOW — Git Repository Belum Diinisialisasi (Blokir CI Aktif)
- **Lokasi:** `docs/project-status.md` Verifikasi Lingkungan #23, `docs/04` §1.1.2
- **Requirement affected:** F-31 (commit manual pemilik), CI/CD pipeline
- **Evidence:** `git status` → "fatal: not a git repository". CI workflow (`.github/workflows/ci.yml`) ada tapi tidak bisa jalan di GitHub Actions.
- **Impact:** Quality gate CI tidak aktif di remote; validasi hanya lokal. Developer tidak boleh `git init`/`push` (F-31).
- **Required correction:** Pemilik **harus** menjalankan `git init`, `git remote add origin <url>`, `git add .`, `git commit -m "chore: initial commit"`, `git push -u origin main` **sebelum** Developer melanjutkan T1.2.
- **Verification method:** `git status` → clean working tree; GitHub Actions workflow terpicu di push pertama.

#### FIND-03 — LOW — Health Check Endpoint Path Deviation (Minor)
- **Lokasi:** `backend/src/modules/health/health.routes.ts`, `docs/02-solution-spec.md` §5.2
- **Requirement affected:** API Contract konsistensi
- **Evidence:** Spec menyebut `GET /health` (liveness). Implementasi expose `/api/v1/health` (liveness) **dan** `/api/v1/health/ready` (readiness). Readiness endpoint **tidak ada di spec** tapi merupakan best practice container orchestration.
- **Impact:** Minor — readiness probe berguna untuk Kubernetes/Docker healthcheck. Tidak breaking bagi klien (spec hanya definisikan liveness).
- **Required correction:** **Option A (recommended):** Update spec §5.2 tambahkan `GET /health/ready` sebagai readiness probe. **Option B:** Hapus readiness endpoint jika pemilik ingin strict adherence. Rekomendasi Reviewer: **Option A** (operational value tinggi, dokumentasikan di DL-20).
- **Verification method:** Spec updated atau endpoint dihapus; health check tetap pass.

#### FIND-04 — LOW — Frontend Test Coverage Threshold Belum Diberlakukan
- **Lokasi:** `frontend/vite.config.ts`, `frontend/package.json`, `docs/03-execution-plan.md` §8
- **Requirement affected:** K-06 (kode bersih, quality gate ≥80%)
- **Evidence:** Frontend hanya 1 test (`App.test.tsx`); coverage threshold **belum dikonfigurasi** di Vitest (backend sudah ≥80%).
- **Impact:** Saat T1.11 (banyak komponen UI), coverage frontend bisa <80% tanpa terdeteksi CI.
- **Required correction:** Tambah `coverage` threshold di `vitest.config.ts` (lines/branches/functions ≥80%) mirip backend Jest config. Aktifkan di CI job `lint-type-test`.
- **Verification method:** `cd frontend && npm run test:coverage` → coverage ≥80% ter-enforce.

#### FIND-05 — INFORMATIONAL — Vitest 3 vs Jest (Documented Deviation)
- **Lokasi:** `docs/04` §8 Deviations #2, `docs/decision-log.md` DL-19
- **Requirement affected:** Spec §11 (Testing strategy: "Jest (unit)")
- **Evidence:** Spec menyebut Jest untuk unit test umum. Frontend memakai **Vitest 3** (kompatibel Vite 6, API setara Jest). Backend tetap Jest.
- **Impact:** Tidak material — Vitest 3 adalah standard modern untuk Vite project, mengurangi toolchain ganda. Sudah terdokumentasi di DL-19 & deviations.
- **Required correction:** Tidak perlu perbaikan kode. **Update spec §11** catatan: "Frontend: Vitest 3 (Vite-native); Backend: Jest" untuk konsistensi dokumentasi.
- **Verification method:** Spec updated.

#### FIND-06 — INFORMATIONAL — Port Mapping Dev (5433/6380) vs Default
- **Lokasi:** `infra/docker-compose.yml`, `docs/04` §5.1 Kendala #5
- **Requirement affected:** K-01 (deployment-ready), developer experience
- **Evidence:** Port host 5433 (PG) & 6380 (Redis) dipakai karena port default 5432/6379 digunakan container proyek lama (`siakad_*`). Internal network tetap 5432/6379.
- **Impact:** Hanya development lokal. Production compose memakai port standard. Tidak ada risiko teknis.
- **Required correction:** Dokumentasikan di `README.md` atau `infra/README.md` agar developer lain tidak bingung. Sudah ada di `docs/04` §5.1.
- **Verification method:** README updated.

---

## 4. Residual Risks (Risiko Residual)

| Risiko | Likelihood | Impact | Mitigasi | Status |
|--------|------------|--------|----------|--------|
| APPROVE SPECIFICATION tidak diberikan → Developer lanjut T1.2+ tanpa gate formal | Medium | Medium (proses, bukan teknis) | **Reviewer gate:** T1.2+ tidak boleh start sebelum Open Items #1 = APPROVED | ⏳ Menunggu pemilik |
| Repo git tidak diinisialisasi pemilik → CI tidak aktif, kolaborasi terbatas | High | Medium | F-31 jelas: commit manual pemilik. Escalate ke pemilik sebelum T1.2 | ⏳ Menunggu pemilik |
| Load test T1.14 menunjukkan backend tidak tahan 5k simultan → ambang waiting room perlu diturunkan | Medium | High (AC-01 gagal) | DL-11: ambang configurable via env; kalibrasi load test bertahap 1k→3k→5k | 🟡 Rencana ada |
| RBAC matrix kompleks (5 tipe + is_wali) → bug akses di production | Medium | High | T1.4: policy service terpusat + 1 test per sel matrix (25+ test case) + E2E T5.7 | 🟡 Rencana ada |
| Payroll detail TBD → T4.4 estimasi tidak akurat | High | Medium | F-26 minimal dulu (T2.1), detail T4.4 setelah user putuskan | 🟡 Rencana ada |
| Integrasi payment gateway/PDDikti detail belum ada → adapter pattern butuh revisi | Medium | Low | Mock dulu, real integration iterasi 4; interface stabil sejak T4.2 | 🟡 Rencana ada |

---

## 5. Keputusan Review (Verdict)

### 5.1 Verdict: **CONDITIONALLY APPROVED**

**Alasan:** 
- **Teknis:** T1.1 **solid, lengkap, dan lulus semua quality gate** (lint, format, typecheck, test coverage ≥80%, build, docker build, health check). Fondasi infrastruktur memenuhi spec dan siap untuk T1.2+.
- **Proses:** **Gate APPROVE SPECIFICATION belum dikonfirmasi eksplisit** oleh pemilik (Open Items #1). Developer beroperasi pada asumsi approval implisit. Ini **harus diklarifikasi** sebelum lanjut ke logika bisnis (T1.2+).
- **Blokir Operasional:** **Repo git belum diinisialisasi** oleh pemilik (F-31) — CI GitHub Actions tidak aktif.

### 5.2 Syarat Lanjut (Conditions for Proceeding)
Developer **BOLEH** melanjutkan T1.2 **hanya setelah** kedua syarat terpenuhi:
1. ✅ **APPROVE SPECIFICATION eksplisit** dari pemilik tertulis di `docs/project-status.md` (Open Items #1 → status APPROVED + tanggal + inisial).
2. ✅ **Git repository diinisialisasi + remote GitHub** oleh pemilik (F-31), push pertama dilakukan, CI GitHub Actions terpicu dan hijau.

Jika syarat di atas **belum** terpenuhi pada sesi berikutnya, Developer **HARUS HENTI** dan menunggu konfirmasi.

---

## 6. Feedback Spesifik untuk Developer

| # | Feedback | Prioritas | Detail |
|---|----------|-----------|--------|
| 1 | **Konfirmasi gate sebelum T1.2** | **BLOCKER** | Jangan mulai T1.2 sebelum Open Items #1 = APPROVED dan repo git ready. Escalate ke pemilik/coordinator. |
| 2 | **Tambah frontend coverage threshold** | HIGH | Sebelum T1.11 (banyak komponen UI), pasang `coverage` di `vitest.config.ts` ≥80% lines/branches/functions. |
| 3 | **Update spec health endpoint** | MEDIUM | Buat DL-20 catat keputusan: tambah `GET /health/ready` ke spec §5.2 (atau hapus endpoint jika pemilih strict). |
| 4 | **Dokumentasikan port mapping dev** | LOW | Tambah note di `README.md` / `infra/README.md` soal port 5433/6380 untuk menghindari konflik container lama. |
| 5 | **Jaga quality gate setiap commit** | ONGOING | Jalankan `npm run lint && npm run format:check && npm run typecheck && npm run test:coverage` **lokal** sebelum push (CI akan enforce tapi feedback lebih cepat lokal). |
| 6 | **Catat keputusan material di decision-log** | ONGOING | Setiap keputusan arsitektur/stack/library yang menyimpang dari spec → buat DL-XX baru. |

---

## 7. Verifikasi Ulang (Re-verification Checklist)

Reviewer akan melakukan re-verifikasi pada sesi berikutnya (saat T1.2+ review) untuk:
- [ ] Open Items #1 = APPROVED (pemilik sign-off)
- [ ] Git repo initialized + remote + CI hijau di GitHub Actions
- [ ] Frontend coverage threshold ≥80% terpasang
- [ ] Spec §5.2 updated (health/ready) atau deviation terdokumentasi DL-20
- [ ] T1.2 (migrasi DB + seed) DoD terpenuhi: migrasi up/down jalan, seed ±2k mahasiswa, constraint unik terpasang
- [ ] T1.3 (Auth Service) DoD: login/logout/refresh jalan, rate limit, refresh rotasi

---

## 8. Penutup

T1.1 **teknis sangat baik** — fondasi yang kuat, quality gate ketat, dokumentasi lengkap, decision log terstruktur. **Kendala utamanya proses (gate approval & git init)**, bukan kode. Setelah kedua syarat proses terpenuhi, proyek siap melaju ke T1.2 dengan percaya diri.

**Reviewer:** Independent Reviewer (Tugas #1)  
**Tanggal:** 2026-08-01  
**Artefak:** `docs/05-review-report.md`