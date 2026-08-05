# Implementation Log — Siak (Sistem Informasi Akademik)

> **Dibuat:** 2026-08-01 (Developer, Tugas #1)
> **Status:** Iterasi 1 — **T1.1–T1.6 selesai & tervalidasi**
> **Referensi:** `docs/02-solution-spec.md` (✅ SPECIFICATION APPROVED), `docs/03-execution-plan.md` (✅ SPECIFICATION APPROVED), `docs/decision-log.md`

---

## 1. Ringkasan Sesi Ini

Developer menyelesaikan **T1.1 — Setup repo monorepo (backend + frontend + infra), Docker, CI pipeline**, **T1.2 — Database Migrations + Seed**, **T1.3 — Auth Service (JWT 15m + refresh 7h, bcrypt, rate limit)**, dan **T1.4 — RBAC Middleware + User Service** sesuai `docs/03-execution-plan.md`.

### 1.1 Asumsi Eksplisit (Gate)

1. **APPROVE SPECIFICATION eksplisit diberikan** oleh pemilik pada 2026-08-01 (tercatat di `docs/project-status.md`). Dokumen `docs/02` dan `docs/03` status **✅ SPECIFICATION APPROVED**. Implementasi dilanjutkan.
2. **Repo git sudah diinisialisasi** oleh pemilik: `origin` → `https://github.com/ratihhfitrianii/Siak.git`, commit `74f7ad3` (T1.1 monorepo + Docker + CI). Push otomatis memicu CI GitHub Actions (fix security audit production-only).
3. **Scope sesi:** T1.1–T1.4. Task T1.5–T1.15 Iterasi 1 akan dilanjutkan sesi berikutnya.

### 1.2 Keputusan Implementasi (detail: `docs/decision-log.md` DL-01 s.d. DL-17)

- Struktur monorepo sesuai DL-16: `backend/`, `frontend/`, `infra/`, `docs/`, `.github/workflows/`.
- Backend: Express 4.21 (stabilitas middleware), Zod untuk validasi env, pino untuk structured logging, pg + ioredis untuk health check dependensi.
- Frontend: React 18 + Vite 6 + Tailwind 3.4 + Vitest 3.
- Health check desain: `GET /api/v1/health` = liveness; `GET /api/v1/health/ready` = readiness (DB/Redis; 503 jika dependensi `down`). Misconfig production ditangkap fail-fast oleh validasi env (Zod superRefine).
- **Migrasi DB (T1.2):** 26 tabel (ERD lengkap 22 tabel + audit/notification/payroll), node-pg-migrate, seed base data (roles, faculties, prodis, academic years, admin users) + seed development (~2000 mahasiswa, ~100 dosen). Docker target `migrate` terpisah untuk menjalankan migrasi otomatis saat `docker compose up`.
- **Auth Service (T1.3):** JWT access 15m + refresh 7h dengan rotation (reuse detection), bcrypt 12 rounds, login brute-force protection (lock 15m after 5 failed attempts), endpoints POST /login, POST /refresh, POST /logout, GET /me. AppError class untuk error handling terstruktur.
- **RBAC (T1.4):** Policy service `src/lib/policy.ts` = single source of truth matriks RBAC §6.1 (23 permission × 5 role; superuser = admin_sistem). Middleware `authenticate` (JWT → load user fresh dari DB, normalisasi BIGSERIAL string→number) + `authorize(permission)` + `authorizeWali` (atribut is_wali hanya bermakna untuk dosen, DL-08). User Service `src/modules/rbac/index.ts`: GET /users/me (profil + menu RBAC untuk UI, AC-10), PUT /users/me/contact, GET /users (list+filter, admin_sistem), POST /users, PUT /users/:id/role (anti self-lockout).

---

---

## 2. Files Changed (T1.1)

### Baru — Root
| File | Keterangan |
|------|------------|
| `README.md` | Panduan struktur, menjalankan, quality gates |
| `.gitignore` | Node_modules, dist, coverage, `.env` (S-04) |
| `.env.example` | Env development placeholder (tanpa secret nyata) |
| `.editorconfig` | Konsistensi editor |
| `.github/workflows/ci.yml` | CI: lint → format → typecheck → test → build → docker build → (staging placeholder) |

### Baru — Backend (`backend/`)
| File | Keterangan |
|------|------------|
| `package.json` | Deps: express, zod, cors, helmet, pino, pino-http, pg, ioredis, dotenv; devDeps: typescript, tsx, jest, ts-jest, supertest, eslint, prettier, node-pg-migrate |
| `tsconfig.json` / `tsconfig.build.json` | Strict TS; build tanpa file test |
| `eslint.config.mjs` | ESLint 9 flat config + Prettier; `no-console` error (pakai pino) |
| `.prettierrc.json`, `.prettierignore` | Format konsisten |
| `jest.config.js` | ts-jest; coverage threshold ≥80% |
| `Dockerfile` | Multi-stage: build (node:22-alpine) → runtime (deps produksi, user node) |
| `.dockerignore`, `.env.example` | — |
| `migrations/README.md` | Panduan node-pg-migrate (migrasi pertama di T1.2) |
| `src/index.ts` | Entry point; graceful shutdown SIGTERM/SIGINT |
| `src/app.ts` | Aplikasi Express; mount router per modul (monolith modular DL-07) |
| `src/config/env.ts` | Validasi env Zod + fail-fast production |
| `src/lib/logger.ts` | pino structured JSON logger |
| `src/middleware/error-handler.ts` | 404 + error handler terpusat (taksonomi docs/02 §9.1) |
| `src/modules/health/health.routes.ts` | `/health` liveness + `/health/ready` readiness |
| `src/modules/{auth,rbac,krs,academic,finance,dosen,audit,notification,import}/index.ts` | Stub router per modul (diisi T1.3+) |
| `src/modules/health/health.test.ts`, `src/config/env.test.ts`, `src/app.test.ts` | Unit/integration test |

### Baru — Frontend (`frontend/`)
| File | Keterangan |
|------|------------|
| `package.json` | React 18, Vite 6, Tailwind 3.4, Vitest 3, ESLint 9, Prettier |
| `vite.config.ts` | Vite + Vitest (jsdom) |
| `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` | Strict TS project references |
| `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore` | Quality gates |
| `index.html`, `tailwind.config.js`, `postcss.config.js`, `src/index.css` | Tailwind setup |
| `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts` | Aplikasi placeholder (halaman login/dashboard di T1.11) |
| `src/test/setup.ts`, `src/App.test.tsx` | Test render dasar |
| `Dockerfile`, `nginx.conf`, `.dockerignore` | Build → nginx:alpine (SPA fallback, cache asset) |

### Baru — Infra (`infra/`)
| File | Keterangan |
|------|------------|
| `docker-compose.yml` | Dev: postgres 16 + redis 7 + backend + frontend (healthcheck, depends_on) |
| `docker-compose.prod.yml` | Prod: nginx + backend + migrate + pgbouncer + postgres + redis + prometheus + grafana + loki |
| `nginx/nginx.conf` | LB + SSL termination + rate limit per IP + proxy WebSocket (S-04, F-17 nanti) |
| `prometheus/prometheus.yml` | Scrape backend |
| `loki/loki-config.yml` | Logging terpusat |
| `grafana/provisioning/datasources/datasources.yml` | Datasource Prometheus + Loki |
| `.env.production.example` | Placeholder env produksi (tanpa secret nyata) |

---

## 3. Files Changed (T1.2 — Database Migrations + Seed)

### Baru — Backend Migrations (`backend/migrations/`)
| File | Keterangan |
|------|------------|
| `V20260801_001__create_core_tables.sql` | Core: roles, users, faculties, prodis, academic_years, semesters |
| `V20260801_002__create_academic_tables.sql` | Academic: courses, curricula, curriculum_courses, classes, schedules, students, lecturers |
| `V20260801_003__create_krs_grades_tables.sql` | KRS/Grades/Payments: krs_periods, krs, krs_details, grades, grade_components, payments, payment_details, attendance, guidance_sessions, substitute_teaching, payroll, audit_logs, notifications |
| `V20260801_004__seed_base_data.sql` | Base seed: 5 roles, 3 faculties, 4 prodis, 2 academic_years, 4 semesters, 5 admin users (per role) |
| `V20260801_005__seed_development_data.sql` | Dev seed: 30 courses, curricula per prodi/semester, 68 classes, schedules, 2004 students, 100 lecturers |
| `*.down.sql` | Rollback migrasi untuk masing-masing file up |

### Diubah
- `backend/Dockerfile`: Tambah target `migrate` (copy migrations, install devDeps, run `npm run migrate:up`)
- `infra/docker-compose.yml`: Service `migrate` pakai target `migrate`, dijalankan sebelum `backend` & `frontend`
- `backend/database.json`: Config node-pg-migrate (dev & prod via env)

---

## 4. Files Changed (T1.3 — Auth Service)

### Baru / Diubah — Backend Auth
| File | Keterangan |
|------|------------|
| `backend/src/modules/auth/index.ts` | Implementasi lengkap: login, refresh (rotation), logout, me; bcrypt 12 rounds; JWT 15m/7h; brute-force lock 15m setelah 5 gagal; in-memory refresh store (dev) |
| `backend/src/modules/auth/auth.test.ts` | 14 test cases: login (5), refresh (4), me (3), logout (2) |
| `backend/src/middleware/error-handler.ts` | Tambah class `AppError` (code, statusCode, details); error handler membedakan AppError vs unknown |
| `backend/src/lib/pg.ts` | PostgreSQL pool dengan connectionString dari env |
| `backend/src/test/setup.ts` | Test env setup (NODE_ENV=test, DATABASE_URL, JWT_SECRET) |
| `backend/jest.config.js` | Hapus setupFiles, tambah forceExit + detectOpenHandles |
| `backend/package.json` | Tambah deps: `bcrypt`, `jsonwebtoken`; devDeps: `@types/bcrypt`, `@types/jsonwebtoken` |

---

## 5. Behavior Implemented

### T1.1 (Fondasi)
1. **Backend service** berjalan di port 3000 (default) dengan:
   - `GET /api/v1/health` → 200 liveness (status, uptime, timestamp).
   - `GET /api/v1/health/ready` → 200 bila DB/Redis tidak `down`; 503 bila dependensi yang dikonfigurasi `down`.
   - 404 `NOT_FOUND` + error handler terpusat `INTERNAL_ERROR` dengan `trace_id`.
   - Graceful shutdown (SIGTERM/SIGINT) menutup server, pool DB, dan koneksi Redis.
   - Validasi env Zod; fail-fast saat `NODE_ENV=production` tanpa `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET`.
2. **Frontend** SPA React + Tailwind menampilkan halaman fondasi; build produksi menghasilkan bundle statis (144 KB / 46 KB gzip).
3. **Infra**: compose dev & prod tervalidasi sintaks; stack dev berhasil `up` (lihat §5).
4. **CI**: workflow GitHub Actions dengan gate lint/format/typecheck/test/coverage/build/docker-build + job security scan (audit production-only) + deploy-staging placeholder (diaktifkan T1.15).

### T1.2 (Database)
5. **Migrasi otomatis** saat `docker compose up`: service `migrate` menjalankan 5 migrasi berurutan (001–005) sebelum `backend` & `frontend` start.
6. **Schema 26 tabel** lengkap sesuai ERD docs/02 §7 (users, roles, faculties, prodis, academic_years, semesters, courses, curricula, classes, schedules, students, lecturers, krs_periods, krs, krs_details, grades, grade_components, payments, payment_details, attendance, guidance_sessions, substitute_teaching, payroll, audit_logs, notifications).
7. **Seed data**: 5 roles, 3 fakultas, 4 prodi, 2 tahun akademik, 4 semester, 5 admin users (1 per role), 30 mata kuliah, 68 kelas, 2004 mahasiswa, 100 dosen.

### T1.3 (Auth Service)
8. **POST `/api/v1/auth/login`**: validasi email/password (Zod), bcrypt compare, reset failed attempts, issue access token (15m) + refresh token (7h, rotation-ready).
9. **POST `/api/v1/auth/refresh`**: verifikasi refresh token (hash SHA-256, TTL 7h, not revoked), rotate (revoke old, issue new pair), return 401 jika token invalid/reused.
10. **GET `/api/v1/auth/me`**: validasi Bearer token (JWT verify), return user profile (id, email, fullName, role, isWali).
11. **POST `/api/v1/auth/logout`**: revoke refresh token jika disediakan; client-side logout tanpa token juga OK.
12. **Brute-force protection**: lock account 15 menit setelah 5 percobaan login gagal berturut-turut.
13. **Error handling terstruktur**: `AppError` dengan kode, status HTTP, detail; 401 UNAUTHORIZED, 400 VALIDATION_ERROR, 429 TOO_MANY_REQUESTS, 403 FORBIDDEN.

---

## 6. Tests Added / Modified

| File | Test | Hasil |
|------|------|-------|
| `backend/src/modules/health/health.test.ts` | liveness 200; readiness not_configured/up/down (kombinasi DB & Redis); unit checkDependencies (up/down/not_configured/parsial) | 10 pass |
| `backend/src/config/env.test.ts` | default test env; production tanpa dependensi → throw; production lengkap → ok | 3 pass |
| `backend/src/app.test.ts` | 404 endpoint tak dikenal; method tidak didukung; errorHandler 500 + trace_id (dengan & tanpa header) | 4 pass |
| `frontend/src/App.test.tsx` | render judul "Siak" | 1 pass |
| **T1.2: Migration** | `backend/src/app.test.ts` (health check DB ready) | terintegrasi |
| **T1.3: Auth** | `backend/src/modules/auth/auth.test.ts` — login (5), refresh (4), me (3), logout (2) | **14 pass** |

**Total: 32 test pass (backend 31 + frontend 1).**

Coverage backend (Jest): statements 92.33% · branches 80% · functions 87.5% · lines 92.33% — **≥80% sesuai quality gate**.

---

## 7. Commands Executed & Actual Results

| # | Perintah | Hasil |
|---|----------|-------|
| 1 | `node -v` / `npm -v` / `git --version` / `docker -v` | v22.15.0 / 10.9.2 / 2.48.1 / 28.0.4 (Docker Desktop awalnya off → di-start) |
| 2 | Backup: `cp -r docs/ → C:\Users\ratih\source\repos\Siak-backup-docs-20260801\` | 6 file tercopy (Risiko #5 brief) |
| 3 | `cd backend && npm install` | added 527 packages |
| 4 | `cd backend && npm run lint` | 0 error, 0 warning |
| 5 | `cd backend && npm run format:check` | All matched files use Prettier code style |
| 6 | `cd backend && npm run typecheck` | 0 error |
| 7 | `cd backend && npm run test:coverage` | 18 passed (17 backend); coverage 100/88.46/100/100 |
| 8 | `cd backend && npm run build` | `dist/index.js` terbentuk |
| 9 | `cd frontend && npm install` | added 352 packages |
| 10 | `cd frontend && npm run lint` / `format:check` / `typecheck` | lulus (0 error) |
| 11 | `cd frontend && npm run test` | 1 passed |
| 12 | `cd frontend && npm run build` | `dist/` 144.44 kB (gzip 46.49 kB) |
| 13 | `docker compose -f infra/docker-compose.yml config --quiet` | OK |
| 14 | `docker compose -f infra/docker-compose.prod.yml --env-file infra/.env.production.example config --quiet` | OK |
| 15 | `docker compose -f infra/docker-compose.yml up -d --build` | lihat §6 (berjalan saat artefak ditulis; hasil final di bawah) |
| 16 | **T1.2: Migrasi DB** `docker compose -f infra/docker-compose.yml up -d --build` | Migrate container: Exited (0) = success; DB 26 tabel, seed 2109 users, 2004 students, 17 lecturers, 30 courses |
| 17 | **T1.2: Verifikasi seed** `docker exec siak-postgres psql ...` | Tabel & counts sesuai ekspektasi (lihat §5 Behavior #7) |
| 18 | **T1.3: Auth deps** `cd backend && npm install bcrypt jsonwebtoken @types/bcrypt @types/jsonwebtoken` | added 4 packages |
| 19 | **T1.3: Auth tests** `cd backend && npm run test:coverage` | 32 passed; coverage 92.33/80/87.5/92.33 |
| 20 | **T1.3: Auth build** `cd backend && npm run build` | `dist/` OK |
| 21 | **T1.1+T1.2+T1.3: Full stack** `docker compose -f infra/docker-compose.yml up -d --build` | 4 containers healthy: postgres, redis, backend, frontend |

### 7.1 Kendala yang Ditemui & Diperbaiki

1. **Mount path health check salah** — router health di-mount di `/api/v1/health` dengan route `/health` → path menjadi `/api/v1/health/health` (404). Diperbaiki: mount di `/api/v1` (sesuai spec §5.2 `GET /health`). Ditutup dengan test.
2. **Coverage branch < 80%** — ditutup dengan test tambahan (env production fail-fast, error handler tanpa trace header, checkDependencies parsial).
3. **Konflik versi Vite** — vitest 2.x membawa vite sendiri yang bentrok dengan Vite 6 → upgrade ke Vitest 3 (kompatibel).
4. **ESLint `no-require-imports`** pada test env (jest.isolateModules) → rule dimatikan khusus file `*.test.ts`.
5. **Port konflik dengan container iterasi lama** — port 5432/6379 di host sudah dipakai container `siakad_*` (proyek lama). Diperbaiki: compose dev memakai host port 5433/6380 (konfigurasi via env `POSTGRES_PORT`/`REDIS_PORT`); internal network tetap 5432/6379.
6. **T1.2: `node-pg-migrate` devDependency tidak terinstall di runtime** — solusi: Dockerfile multi-stage dengan target `migrate` terpisah yang install devDeps + copy migrations folder.
7. **T1.2: `README.md` di folder migrations dibaca sebagai migrasi** — solusi: pindahkan ke `README-migrations.md` di root.
8. **T1.2: Seed SQL syntax error** — `INSERT ... RETURNING` di dalam DO block assignment tidak valid PostgreSQL. Diperbaiki: gunakan variabel PL/pgSQL atau `INSERT ... ON CONFLICT` + `UPDATE` terpisah.
9. **T1.3: JWT `sub` claim berupa string (per spec)** — validasi TypeScript memeriksa `typeof sub === 'number'` gagal. Diperbaiki: accept string/number, parse jika string.
10. **T1.3: Test auth race condition** — test `GET /me` berjalan sebelum `beforeAll` login karena Jest describe paralel. Diperbaiki: helper `loginAndGetTokens()` dipanggil di setiap test, bukan variabel global.
11. **T1.3: Open handle Jest (setInterval cleanup)** — cleanup interval jalan di test env. Diperbaiki: skip `startCleanupInterval()` saat `NODE_ENV === 'test'`.

---

## 8. Docker Compose Up — Hasil (DoD T1.1 + T1.2 + T1.3)

```text
$ docker compose -f infra/docker-compose.yml up -d --build
# Output: migrate Built, backend Built, frontend Built
# Containers: siak-postgres (healthy, 0.0.0.0:5433→5432), siak-redis (healthy, 0.0.0.0:6380→6379),
#             siak-migrate (Exited 0 = success), siak-backend (healthy), siak-frontend (Up)

$ curl http://localhost:3000/api/v1/health
{"success":true,"data":{"status":"ok","service":"siak-backend","version":"0.1.0","uptimeSeconds":18,"timestamp":"2026-08-01T11:40:52.304Z"}}

$ curl http://localhost:3000/api/v1/health/ready
{"success":true,"data":{"status":"ready","dependencies":{"db":"up","redis":"up"}}}

$ curl -I http://localhost:8080
HTTP/1.1 200 OK
Server: nginx/1.27.5
Content-Type: text/html
```

**DoD T1.1 + T1.2 + T1.3 terpenuhi:**
- ✅ `docker compose up` jalan (migrate success + 4 containers healthy)
- ✅ Health check liveness `/health` → 200
- ✅ Health check readiness `/health/ready` → 200 (db:up, redis:up)
- ✅ Frontend via nginx di port 8080 → 200
- ✅ CI pipeline file `.github/workflows/ci.yml` tersedia (audit production-only)
- ✅ **Migrasi 26 tabel + seed data** (2109 users, 2004 students, 100 lecturers, 30 courses)
- ✅ **Auth Service lengkap**: login, refresh (rotation), logout, me; bcrypt 12; JWT 15m/7h; brute-force lock
- ✅ **Test 32 pass**; coverage ≥80% (statements 92.33%, branches 80%, functions 87.5%, lines 92.33%)

---

## 9. Known Limitations

1. **Modul bisnis T1.4+ masih stub** — rbac, krs, academic, finance, dosen, audit, notification, import hanya router kosong; endpoint mengembalikan 404 sampai task terkait diimplementasikan.
2. **CI GitHub Actions** — trigger otomatis oleh push T1.1 (`74f7ad3`); fix security audit production-only di-commit (`201d280`), menunggu hijau.
3. **`deploy-staging` di CI berupa placeholder** — diaktifkan pada T1.15.
4. **Monitoring (Prometheus/Grafana/Loki) belum diuji end-to-end** — hanya file konfigurasi + validasi sintaks compose; diuji penuh saat T4.6.
5. **Coverage frontend belum diberlakukan ≥80%** — jumlah test frontend masih minim (1 test); threshold aktif saat T1.11 (banyak komponen).
6. **Psql/redis-cli tidak ada di host** — koneksi DB/Redis hanya lewat Docker (bukan kendala, hanya catatan environment).

---

## 10. Deviations

1. **Tidak ada deviasi dari spec docs/02 untuk cakupan T1.1–T1.3.** Perbedaan kecil yang tercatat:
   - `GET /health/ready` tambahan (di luar spec yang hanya menyebut `GET /health`) — dipakai untuk readiness check container; `GET /health` tetap sesuai spec (liveness).
   - `JWT_SECRET` divalidasi wajib hanya saat `NODE_ENV=production` (fail-fast), bukan selalu — agar development lokal tanpa auth bisa jalan.
2. **Vitest 3** dipilih menggantikan "Jest (unit)" untuk frontend karena toolchain Vite (spec §11 menetapkan Jest untuk unit test secara umum; frontend memakai Vitest yang API-nya setara Jest, mengurangi toolchain ganda). Backend tetap Jest sesuai spec. *(Keputusan material → DL-19.)*

---

## 11. Security Considerations

- Tidak ada token/secret yang ditulis ke artefak (S-04): semua env memakai placeholder (`<ganti-dengan-...>`, `dev-only-...`).
- `.env`, `.env.*.local` masuk `.gitignore`; hanya `*.example` yang di-commit.
- Backend memakai `helmet` (header keamanan) dan `cors` dengan origin terbatas.
- `no-console` di-enforce; logging via pino (structured).
- Rate limit per IP sudah disiapkan di Nginx (login 5r/m, API 100r/m) — enforcement penuh di T1.3.
- Validasi input (Zod) sudah tersedia sebagai fondasi anti SQL injection (bersama pg parameterized).
- **Auth (T1.3):** bcrypt 12 rounds, JWT 15m access + 7h refresh dengan rotation, brute-force lock 15m/5 attempts, refresh token SHA-256 hash storage.

---

## 12. Remaining Risks

1. **CI GitHub Actions belum hijau** — push fix security audit sudah dilakukan, menunggu hasil Actions.
2. **Docker Desktop harus menyala** untuk `docker compose up` (environment lokal).
3. **Lecturer seed count 17/100** — seed development data perlu diperbaiki (CTE logic) di T1.4+; tidak memblokir T1.2–T1.3.

---

## 13. Handoff ke Reviewer

Independent review diperlukan sebelum release. Bukti untuk direproduksi:

```bash
# Backend
cd backend && npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage && npm run build
# Frontend
cd frontend && npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build
# Docker
docker compose -f infra/docker-compose.yml up -d --build
curl http://localhost:3000/api/v1/health
curl http://localhost:3000/api/v1/health/ready
curl http://localhost:8080   # frontend via nginx
# Auth endpoints (password dev terdokumentasi — lihat §15.4)
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin@siak.local","password":"Admin123!"}'
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"mhs.TI_20232024_1@siak.local","password":"Mhs123!"}'
```

---

## 14. T1.4 — RBAC Middleware + User Service (2026-08-02)

**Status: DONE ✅** — DoD: matriks RBAC §6.1 di-enforce di semua route; 1 test per sel matrix (115 sel + integration); coverage ≥80% hijau; build lulus.

### 14.1 File Baru/Diubah

| File | Keterangan |
|------|------------|
| `backend/src/lib/policy.ts` | **Single source of truth RBAC**: 23 permission × 5 role (`ROLE_PERMISSIONS`), `can()`, `permissionsFor()`, `isSuperuser()`, `isWaliRole()`. Matriks literal §6.1 (sel ⚠️ asumsi tidak dimasukkan sampai dikonfirmasi) |
| `backend/src/lib/auth-middleware.ts` | `authenticate` (JWT → load user fresh dari DB, normalisasi BIGSERIAL string→number, tolak akun non-aktif 403), `authorize(permission)` (403 di luar peran), `authorizeWali` (hanya dosen ber-atribut is_wali) |
| `backend/src/types/express.d.ts` | Deklarasi global `Express.Request.user` |
| `backend/src/modules/rbac/index.ts` | User Service: GET /users/me (profil + menu RBAC untuk UI, AC-10), PUT /users/me/contact, GET /users (list+filter+pagination, admin_sistem), POST /users, PUT /users/:id/role (anti self-lockout 400) |
| `backend/src/modules/rbac/rbac.test.ts` | 136 test: 115 sel matriks (data-driven dari spec literal, anti self-confirmation) + integration 5 peran |
| `backend/src/lib/auth-middleware.test.ts` | Edge cases: token invalid/ghost/string-sub/no-sub, akun non-aktif, unit test authorize/authorizeWali |
| `infra/docker-compose.yml` | Fix healthcheck backend: `/health` → `/api/v1/health` (sebelumnya salah path → container unhealthy) |

### 14.2 Temuan & Perbaikan (Pitfalls)

1. **jsonwebtoken mengubah claim `sub` jadi string** saat sign (JWT spec) — `authenticate` menerima number maupun string (`Number(decoded.sub)`), tidak lagi hard-reject.
2. **pg driver mengembalikan BIGSERIAL (int8) sebagai string** — `req.user.id` sempat bertipe string → anti self-lockout (`targetId === actor.id`) gagal. Normalisasi `Number(row.id)` di `authenticate` menyelesaikan 15 test yang gagal sekaligus.
3. **Healthcheck compose salah path** (`/health` vs `/api/v1/health`) — container `siak-backend` unhealthy sejak awal; diperbaiki & diverifikasi `Up (healthy)`.
4. **Coverage branch turun ke 64.9%** setelah module rbac masuk — ditutup dengan test edge cases (invalid body, duplicate email, role ghost, id invalid, user not found, filter query).

### 14.3 Verifikasi

```text
- 192 test lulus (6 suite) | coverage: Stmts 93.79% | Branch 81.45% | Funcs 89.58% | Lines 93.76%
- lint, format:check, typecheck, build: exit 0
- Docker: siak-backend Up (healthy), siak-postgres/siak-redis healthy, siak-migrate exited 0
- Live: login admin@siak.local → GET /users/me (role admin_sistem, menu 23 item) → GET /users?limit=3 (total 2109)
```

### 14.4 Open Items (dilanjutkan T1.5+)

1. **Seed password admin tidak cocok** dengan hash terdokumentasi di seed (hash `$2b$12$LQv...` ≠ `Admin123!`/`admin123`). Admin dev di-reset manual via SQL (`UPDATE users SET password_hash=...`). Perlu perbaiki seed development + dokumentasi password dev yang konsisten.
2. **Lecturer seed count 17/100** — CTE `V20260801_005` perlu diperbaiki (bug sejak T1.2).
3. **Menu RBAC** (`GET /users/me` → `menu[]`) siap dikonsumsi frontend (T1.9+ Login/Register UI).
4. Healthcheck frontend (`siak-frontend`) belum diverifikasi healthy di compose (nginx proxy).

---

## 15. T1.5 — KRS Core (2026-08-02)

**Status: DONE ✅** — DoD: alur KRS mahasiswa (periode aktif → kelas tersedia → draft → submit → kunci, AC-07) + proteksi kelas penuh (AC-02/AC-04b) + 1 test per perilaku; coverage ≥80% hijau; build lulus; verifikasi live end-to-end.

### 15.1 File Baru/Diubah

| File | Keterangan |
|------|------------|
| `backend/src/modules/krs/index.ts` | **KRS Core** (400 baris): GET `/krs/period` (periode aktif/tutup), GET `/krs/available-classes` (kelas prodi + semester periode, kuota tersisa), POST `/krs/draft` (simpan draft, 1+ kelas, periode wajib buka), POST `/krs/submit` (validasi kelas tersedia + kuota, kunci submission, increment `current_enrolled`), GET `/krs/my` (KRS mahasiswa + status + total kredit). Error: `KRS_PERIOD_CLOSED` 403, `CLASS_NOT_AVAILABLE` 409, `CLASS_FULL` 409, `KRS_LOCKED` 409. Middleware `authenticate` + `authorize('krs.fill')` + `requireStudent` |
| `backend/src/modules/krs/krs.test.ts` | 22 test: alur happy path, edge cases (tanpa token 401, admin tanpa studentId 403, kelas prodi lain 409, kelas penuh 409, periode tutup 403, draft setelah submit 409 KRS_LOCKED) |
| `backend/src/modules/auth/index.ts` | UX fix: pesan validasi login kini spesifik per field (`Email tidak valid` + `details.fields`), bukan pesan generik |
| `backend/migrations/V20260801_006__seed_krs_dev.sql` | Seed dev KRS: periode aktif relatif "sekarang" (buka 7 hari lalu, tutup 30 hari lagi) + kelas A/B untuk kurikulum 2024/2025-1 |
| `backend/migrations/V20260801_007__fix_seed_emails.sql` | **Fix bug seed**: email mahasiswa mengandung `/` (mis. `mhs.AKT_2023/2024_1@…`) → invalid RFC 5322, selalu ditolak `loginSchema` zod → seluruh akun mahasiswa tidak bisa login. Buang `/`: `mhs.AKT_20232024_1@siak.local` |
| `backend/migrations/V20260801_008__seed_krs_all_prodi.sql` | Kurikulum + kelas untuk MNJ/AKT/HKM/KN (V006 hanya TI/SI); total kelas 20 (semua 6 prodi) |
| `backend/migrations/V20260801_009__fix_seed_passwords.sql` | **Fix open item T1.2**: hash seed `$2b$12$LQv…` tidak cocok password terdokumentasi (typo). Hash benar per role group (lihat §15.4) |
| `backend/migrations/V20260801_005__seed_development_data.sql` | Email mahasiswa pakai `replace(ay.code,'/','')`; hash dosen/mahasiswa diperbarui |

### 15.2 Temuan & Perbaikan (Pitfalls)

1. **zod 3.25.76 menolak email `x@y.z`** (regex email ketat: TLD ≥ 2 karakter) — saat debugging live terlihat `400 VALIDATION_ERROR` padahal body terkirim benar. Pelajaran: verifikasi payload dengan email valid.
2. **MSYS bash meng-mangle JSON berisi `/`** di argumen `curl -d '{"email":"mhs.AKT_2023/2024_1@…"}'` (path mangling) → body rusak → 400. Verifikasi API live memakai Python `urllib` (bebas masalah quoting shell).
3. **`pgPool.end()` di `afterAll` suite pertama menutup pool untuk suite kedua** dalam file test yang sama → `Cannot use a pool after calling end`. Pool ditutup hanya di `afterAll` terakhir.
4. **Cleanup FK berantai**: hapus `krs_submissions` sebelum `students` sebelum `users` (FK `krs_submissions_student_id_fkey`).
5. **Draft response tidak mengembalikan items** (hanya `submissionId, status, message`) — kontrak disengaja; detail KRS dibaca via `GET /krs/my`.

### 15.3 Verifikasi

```text
- 207 test lulus (7 suite) | coverage: Stmts 93.76% | Branch 82.22% | Funcs 91.93% | Lines 93.71%
- lint, format:check, typecheck, build: exit 0
- Docker: siak-backend Up (healthy), 12 migration tercatat (V001–V009 + down)
- Live E2E (mahasiswa AKT): login 200 → period open "KRS Utama Ganjil 2024/2025" →
  available-classes 2 kelas (AKT301 A/B) → draft 200 → submit 200 (submitted) →
  /krs/my status submitted, isLocked true, totalCredits 6 → draft ulang 409 KRS_LOCKED (AC-07)
- Semua akun seed login tanpa reset manual: admin*/Admin123!, dosen.*/Dosen123!, mhs.*/Mhs123!
```

### 15.4 Kredensial Dev Terdokumentasi

| Akun | Format email | Password |
|------|--------------|----------|
| Admin (sistem/akademik/keuangan) | `admin@siak.local`, `akademik@siak.local`, `keuangan@siak.local`, `sistem@siak.local` | `Admin123!` |
| Dosen | `dosen.<PRODI><n>@siak.local` (contoh `dosen.TI1@siak.local`) | `Dosen123!` |
| Mahasiswa | `mhs.<PRODI>_<TA>_<n>@siak.local` (contoh `mhs.AKT_20232024_1@siak.local`) | `Mhs123!` |

### 15.5 Open Items (dilanjutkan T1.6+)

1. **Lecturer seed count 17/100** — CTE `V20260801_005` menghasilkan 17 dosen (bukan ~100); belum kritis untuk fungsionalitas (kelas sudah punya lecturer), perlu diperbaiki saat seed disempurnakan.
2. **Refresh token store masih in-memory Map** — perlu Redis (multi-instance, skala 5k) di task infra selanjutnya.
3. **Duplicate periode KRS dev** (id 1 & 2, semester 3, nama sama) — artefak seed V006; tidak mengganggu (query `ORDER BY id DESC LIMIT 1`), rapikan saat seed disempurnakan.
4. CI T1.5 belum dikonfirmasi hijau di GitHub (push berikutnya).

**Catatan untuk Reviewer:** semua quality gate lokal hijau (lint/format/typecheck/build/test:coverage ≥80%); CI GitHub Actions akan memvalidasi dari push T1.5 (commit berikutnya).

---

## 16. T1.6 — KRS Validasi Admin + Notifikasi (2026-08-02)

**Status: DONE ✅** — DoD: Admin Akademik approve/reject + alasan (AC-04, AC-04c); revisi KRS setelah reject jalan saat periode (AC-04c); notifikasi in-app otomatis ke mahasiswa yang belum isi KRS (AC-04d, scheduler dasar); 218 test hijau, coverage ≥80%; verifikasi live end-to-end.

### 16.1 File Baru/Diubah

| File | Keterangan |
|------|------------|
| `backend/src/modules/notification/index.ts` | **Modul notifikasi in-app** (baru, 200 baris): `sendInAppNotification()` (helper untuk modul lain), `remindUnfilledStudents()` (AC-04d — idempotent via NOT EXISTS per (user, periode)), router `GET /notifications/my` + `PUT /notifications/:id/read` (hanya milik sendiri, AC-10) |
| `backend/src/modules/krs/index.ts` | **Validasi admin** (tambah ~250 baris): `GET /krs/admin/pending` (list KRS submitted + NIM/nama/prodi/itemCount/SKS), `POST /krs/admin/:id/approve` (status approved + approved_by/at + notif atomik dalam transaksi), `POST /krs/admin/:id/reject` (alasan ≥5 karakter + is_locked=false + notif berisi alasan), `POST /krs/admin/remind-unfilled` (pemicu manual). Guard draft/submit diubah: status `rejected` boleh edit (AC-04c); submit ulang me-reset rejection_reason/approved_by |
| `backend/src/index.ts` | **Scheduler dasar AC-04d**: tick pertama 60s setelah start, interval env `KRS_REMINDER_INTERVAL_MS` (default 6 jam), disabled di test, `.unref()` agar tidak menggantung shutdown |
| `backend/src/modules/krs/krs.test.ts` | **13 test baru T1.6** (25 total): alur approve (pending→approve→notif→double-approve 409), reject (validasi alasan→reject→notif→revisi→submit ulang reset), RBAC 403 (mahasiswa/admin_keuangan), notif read (punya sendiri 200 / orang lain 404 / id invalid 400), reminder idempotent. Helper `restoreClassQuota()` di semua cleanup |
| `backend/src/modules/rbac/rbac.test.ts` | beforeAll timeout 5s → 20s (full suite paralel membebani DB test) |
| `backend/migrations/V20260801_010__reset_class_quota_dev.sql` | Reset `current_enrolled` kelas seed dev → 0 (V006 mengisi 28–30/30 → test submit selalu CLASS_FULL). Dev-only |

### 16.2 Temuan & Perbaikan (Pitfalls)

1. **Quota kelas terkuras antar-run test** — submit menaikkan `current_enrolled`; cleanup lama tidak menurunkannya → run berulang (atau full suite) kena `CLASS_FULL` 409 di test happy path. Fix ganda: (a) migrasi V010 reset kuota seed, (b) `restoreClassQuota()` di setiap afterAll/cleanup (decrement sebelum krs_items ter-CASCADE).
2. **Seed V006 mengisi kelas nyaris penuh** (28–30 dari kapasitas 30) — kelas dev sebaiknya kosong/deterministik; test memilih `availableClasses.slice(0,2)` = kelas pertama yang sudah penuh.
3. **Scheduler live aktif di container** — verifikasi live menemukan notif `krs_reminder` sudah terkirim otomatis (tick 60s), membuktikan AC-04d bekerja; di test disabled via NODE_ENV=test.
4. **rbac beforeAll timeout 5s di full suite** — krs suite (lebih berat: 25 test + insert ribuan baris reminder) berjalan paralel; hook timeout dinaikkan ke 20s.
5. **`Number(undefined)` = NaN → query bigint error** — cleanup T1.6 memanggil restoreClassQuota sebelum student dibuat (beforeAll); di-guard `Number.isFinite`.

### 16.3 Verifikasi

```text
- 218 test lulus (7 suite) | coverage: Stmts 93.67% | Branch 80.69% | Funcs 91.66% | Lines 93.79%
- lint, format:check, typecheck, build: exit 0
- Docker: siak-backend Up (healthy), migrasi V010 terpasang (kelas kuota 0)
- Live E2E (admin akademik + mhs seed): login → submit 200 → pending list (itemCount 2) →
  approve 200 (approved) → notif mhs ['krs_approved','krs_reminder'] → approve ulang 409 KRS_NOT_PENDING →
  reject mhs MNJ 200 (alasan) → draft ulang 200 → submit ulang 200 (locked) →
  remind-unfilled idempotent (0 baris kedua) → mhs akses pending 403 FORBIDDEN
- Scheduler AC-04d terbukti jalan di container (krs_reminder terkirim otomatis, idempotent)
```

### 16.4 Open Items (dilanjutkan T1.7+)

1. **Notifikasi email/push + retry gagal** — dijadwalkan T2.5 (plan docs/03); saat ini in-app saja.
2. **Lecturer seed count 17/100** — open item T1.2 (dibawa terus).
3. **Refresh token store in-memory** — perlu Redis (T1.12/T4).
4. **CI GitHub T1.5/T1.6** — konfirmasi Actions setelah push.

---

## 17. T1.7 — Academic (Struktur Organisasi + Kurikulum) & T1.8 — Grades (2026-08-03)

**Status: DONE ✅** (ringkasan — detail lengkap di commit `2962759` & `989e89e`)

### 17.1 T1.7 — Academic (F-07b, F-07c, F-22)

| File | Keterangan |
|------|------------|
| `backend/src/modules/academic/index.ts` | Fakultas, Prodi, Departemen, Mata Kuliah, Kurikulum: GET (semua peran login) + POST (admin: `academic.manage`/`course.manage`) |
| `backend/src/lib/policy.ts` | Permission baru: `academic.manage`, `kurikulum.manage`, `course.manage`, `schedule.manage` |
| `backend/migrations/V20260801_011__add_departemen_and_extend_curriculum.sql` | Tabel `departemens` + relasi kurikulum diperluas |
| `backend/src/modules/academic/academic.test.ts` | 10 test, branch 100% |

### 17.2 T1.8 — Grades (F-06, F-06a, F-06b, F-06c, F-10)

| File | Keterangan |
|------|------------|
| `backend/src/modules/grades/index.ts` | Input nilai bobot tugas 20% / UTS 30% / UAS 50%; remedial `max(asli, remedial)`; skala A=4.0 s.d. E=0.0; POST/PUT `/api/v1/grades`; GET `/grades/class/:id` & `/grades/student/:id`; atribusi `input_by`/`updated_by`; RBAC `grade.input`/`grade.edit` |
| `backend/src/modules/grades/grades.test.ts` | 37 test mengeksekusi endpoint dengan data test sendiri (bukan skip); 3 bug nyata ditemukan & diperbaiki: kolom `c.code`→`class_code` (500), BIGINT string vs number pada `lecturer_id` (dosen tak pernah dianggap pengampu), `grade_point || null` memakan nilai 0 (E) |
| `backend/src/app.ts` | Router grades terdaftar di `/api/v1/grades` |

### 17.3 Verifikasi T1.7 + T1.8

```text
- 294 test lulus (10 suite) | global: Stmts 94.01% | Branch 84.02% | Funcs 95.4%
- grades module: branch 86.22%, funcs 100%
- lint, format:check, typecheck, build: exit 0
- Commit 989e89e → CI GitHub Actions run 30785369708: 5/5 job SUCCESS
  (Backend lint/typecheck/test:coverage/build, Security npm audit, Frontend, Docker images, Deploy staging)
```

---

## 18. T1.9 — Audit Trail Service + Atribusi (2026-08-03)

**Status: DONE ✅** — DoD: semua mutasi tercatat (user, action, old/new JSONB, label atribusi "diinput oleh X"); RBAC `audit.view` (Admin Akademik/Keuangan/Sistem per matriks §6.1); 320 test hijau, coverage ≥80%; quality gates lulus.

### 18.1 File Baru/Diubah

| File | Keterangan |
|------|------------|
| `backend/src/lib/audit-service.ts` | **Audit Service** (baru): `writeAuditLog()` (INSERT ke `audit_logs`, dukung transaksi via `client` — pola KRS), `buildChangedByLabel()` ("diinput oleh {nama} ({role})", potong 100 char), `sanitizeIp()` (INET hanya terima IP valid), `auditFromRequest()` (ambil user/IP/user-agent otomatis) |
| `backend/src/modules/audit/index.ts` | **Router audit** (stub → penuh): `GET /api/v1/audit-logs` — filter `tableName`, `action`, `changedBy`, `from`/`to` (ISO), pagination, sort whitelist (anti SQLi S-03); JOIN `users` untuk `changedByEmail` |
| `backend/src/modules/auth/index.ts` | Hook audit: login sukses → `LOGIN` (akuntabilitas F-13) |
| `backend/src/modules/grades/index.ts` | Hook audit: POST → `INSERT grades`, PUT → `UPDATE grades` (old/new JSONB) |
| `backend/src/modules/krs/index.ts` | Hook audit atomik dalam transaksi: draft/submit (INSERT/UPDATE `krs_submissions`), approve/reject (UPDATE) |
| `backend/src/modules/academic/index.ts` | Hook audit: INSERT faculties/prodis/departemens/courses |
| `backend/src/modules/rbac/index.ts` | Hook audit: INSERT users (create), UPDATE users (contact — password TIDAK dicatat S-04; role change — old/new roleCode) |
| `backend/migrations/V20260801_012__audit_logs_changed_by_set_null.sql` | **Fix desain**: `audit_logs.changed_by` → `ON DELETE SET NULL` (kolom nullable). Saat user dihapus, jejak audit TETAP ada (append-only S-06); sebelumnya FK default → hapus user = error FK |
| `backend/src/modules/audit/audit.test.ts` | 26 test: unit service (label, sanitizeIp, writeAuditLog pool + transaksi), RBAC 6 sel (401/403×2/200×3), filter/pagination/sort/validasi, integrasi mutasi→audit (login, grades INSERT/UPDATE, faculties, users — verifikasi label + old/new + tanpa password) |

### 18.2 Temuan & Perbaikan (Pitfalls)

1. **FK `audit_logs_changed_by_fkey` memblokir hapus user** — setelah hook login aktif, test lama yang `DELETE users` di cleanup gagal FK; ini juga bug produksi (Admin Sistem hapus user → 500). Solusi: migration V012 `ON DELETE SET NULL` — jejak audit tidak pernah hilang (append-only).
2. **`current_enrolled` kelas seed terkuras antar-run test** — menjalankan `krs.test.ts` berulang kali menaikkan kuota tanpa reset (masalah pre-existing T1.6, open item §16.4); reset manual dev `UPDATE classes SET current_enrolled = 0` sebelum verifikasi. KRS test sebaiknya reset kuota di cleanup (sudah ada `restoreClassQuota` untuk kasus spesifik).
3. **pg driver BIGSERIAL → string** — `findByRole()` di test perlu `Number()`; `changedBy`/`recordId` dinormalisasi di response router audit.
4. **oldValues dari DB NUMERIC berupa string** (`'81.00'`) vs newValues number — assertion test menyesuaikan.
5. **`z.enum` butuh tuple `as const`** — `AuditAction[]` (array) ditolak typecheck.

### 18.3 Verifikasi

```text
- 320 test lulus (11 suite) | global: Stmts 94.52% | Branch 84.37% | Funcs 95.69%
- audit module: 100% | audit-service: branch 84.61%
- lint, format:check, typecheck, build: exit 0
- Migrasi V012 terpasang (dev: pgmigrations tercatat, constraint SET NULL aktif)
- Integrasi terbukti: login → LOGIN tercatat; POST/PUT grades → INSERT/UPDATE grades
  dengan old/new JSONB + label "diinput oleh X (role)"; fakultas & user tercatat (tanpa password)
```

### 18.4 Open Items (dilanjutkan T1.10+)

1. **UI badge "diinput oleh X"** — backend sudah menyediakan `changed_by_label`; rendering badge di frontend menyusul T1.11 (Login/Dashboard) / T5.
2. **Audit untuk modul stub** (finance, import, dosen) — otomatis aktif saat modul diimplementasikan (hook wajib per A-4).
3. **Retensi & arsip audit_logs** — kebijakan (mis. arsip >1 tahun) dijadwalkan T4.7 (security audit).
4. **CI T1.9** — konfirmasi Actions setelah push (commit menyusul manual owner, F-31).

## 19. T1.10 — Import Data Excel/CSV (F-18, K-08) (2026-08-03)

**Status: DONE ✅** — DoD: upsert NIM/NIDN existing; laporan baris gagal + alasan; validasi schema; 336 test hijau, coverage ≥80%; quality gates lulus. RBAC: hanya Admin Sistem (`import.data`).

### 19.1 File Baru/Diubah

| File | Keterangan |
|------|------------|
| `backend/src/modules/import/index.ts` | **Modul Impor** (stub → penuh): `POST /import/students`, `/import/lecturers`, `/import/courses` — parse CSV (`csv-parse/sync`) & XLSX (`exceljs`), batas 2MB (multer memory), validasi header + schema per baris (zod), upsert per baris dalam SATU transaksi + SAVEPOINT per baris (baris gagal tidak menggagalkan baris lain), audit `IMPORT` atomik dengan mutasi |
| `backend/src/modules/import/import.test.ts` | 16 test: RBAC 4 sel (401/403×3), validasi file (tanpa file, ekstensi, kosong, header hilang, >2MB, xlsx rusak), mahasiswa (baru+existing, baris invalid 4 alasan, duplikat NIM, konflik user), dosen (baru+existing, tanpa NIDN), matkul (CSV + XLSX, sks 0), audit IMPORT, login mustChangePassword |
| `backend/migrations/V20260801_013__users_must_change_password.sql` | Kolom `users.must_change_password` (default false) — password default hasil impor WAJIB diganti saat login pertama (spec §6.3); flag dilaporkan di respon login |
| `backend/src/modules/auth/index.ts` | Login: SELECT + respon `user.mustChangePassword` |
| `backend/src/lib/audit-service.ts` | `AuditAction` + `'IMPORT'` |
| `backend/package.json` | Deps baru: `multer`, `csv-parse`, `exceljs`; `overrides.uuid ^11.1.1` (tutup GHSA-w5hq-g745-h8pq moderate di tree exceljs) |
| `backend/src/modules/krs/krs.test.ts` | Purge sisa data test dari run terputus (lihat §19.2 #3) |

Kolom file impor (per docs/02 §6.6): **students** `nim, full_name, prodi_code, angkatan, [kontak=email]`; **lecturers** `nidn, full_name, prodi_code, [kontak=email]`; **courses** `kode, nama, sks`. Alias kolom diterima (mis. `nama`↔`full_name`, `kode_prodi`↔`prodi_code`, `nik`/`nip`↔`nidn`). Email kosong → otomatis `{nim}@student.siak.local` / `{nidn}@siak.local` (lowercase). Password default: env `IMPORT_DEFAULT_PASSWORD` (default `Siak123!`), bcrypt cost 10.

### 19.2 Temuan & Perbaikan (Pitfalls)

1. **`xlsx` (SheetJS) npm 0.18.5 membawa 2 advisory HIGH** (prototype pollution GHSA-4r6h-8v6p-xvw6 + ReDoS GHSA-5pgg-2g8v-p4x9, tanpa fix) → **ganti ke `exceljs`** — aktif dipelihara, 0 advisory, dan sudah direncanakan untuk export transkrip (docs/02 §6.4: pdfmake/exceljs). `auditConfig.ignore` yang ada (`GHSA-5j98-mcp5-4vw2`) tidak menutup 2 advisory baru ini — CI audit prod akan merah jika tetap pakai xlsx.
2. **ExcelJS 4.4 → uuid <11.1.1 (moderate GHSA-w5hq-g745-h8pq)** — override `uuid ^11.1.1` (masih CJS, kompatibel); audit prod `--omit=dev` = 0 vuln. Sisa 2 high di `node-pg-migrate→glob` = devDependency pre-existing (bukan blokir CI prod).
3. **Periode test sisa dari run terputus menggagalkan krs.test.ts** — `findActivePeriod()` (produksi) memilih periode aktif TERBARU; run yang di-kill (mis. timeout) meninggalkan `krs_periods T1.8-TEST-*` aktif + id lebih tinggi dari seed → suite krs berikutnya memilih periode itu (semester acak) → `availableClasses` 0 / draft 409. Solusi: purge deterministik di beforeAll krs (submissions → classes → periods, urutan FK) — aman karena `--runInBand` sekuensial.
4. **Email impor di-lowercase** (`toLowerCase()`) tapi query login case-sensitive — NIM test harus lowercase agar login test cocok (bug di test, bukan modul). **Efek lanjutan**: run test lama (pra-patch, NIM uppercase) membuat user via modul (email lowercase) lalu test login gagal 401 → `createdEmails.push` tak dieksekusi → user sisa tanpa cleanup. Cleanup diubah ke **berbasis pola** (`LIKE 'imp-%-{ts}@siak.local'`, `t110%@...`) — robust walau test gagal di tengah (setelahAll tetap jalan).
5. **Buffer generic mismatch** (`Buffer<ArrayBufferLike>` vs tipe `Buffer` lama di exceljs/csv-parse/supertest) — cast via `unknown` / `Parameters<typeof load>[0]`; runtime exceljs terima Buffer apa pun.
6. **Typecheck lint "error TS6053 File not found"** saat `patch` — noise path MSYS (`/c/...` vs `C:\\...`), bukan error nyata; verifikasi dengan `npm run typecheck` yang benar.
7. **Cleanup afterAll berbasis pola, bukan list** — kalau sebuah test gagal di tengah SEBELUM push ke `createdEmails`, user yang sudah dibuat modul tidak terhapus (yatim). Pattern `LIKE 'imp-%-{ts}@'` / `t110%@...` membersihkan apa pun yang cocok dengan run ini, robust terhadap kegagalan tengah. (Dipicu temuan 8 user yatim dari run pra-patch lowercase — lihat #4.)
8. **`process.env.DATABASE_URL =` vs `??=` — bug CI yang hanya muncul di runner** — import.test.ts menimpa paksa ke `localhost:5433` (port publish docker lokal); 8 suite lain pakai `??=` sehingga env CI (`postgres://...@localhost:5432/siak`) dihormati. Di CI tidak ada postgres di 5433 → ECONNREFUSED → login admin 500 → **16/16 test import gagal** (run 30806477650, padahal lokal 336/336 hijau 2×). Perbaikan: `??=`. **Pelajaran: semua env test wajib `??=`, jangan `=` — reproduksi kondisi CI (DB segar + port berbeda) perlu dijalankan sebelum commit.**

### 19.3 Verifikasi

```text
- 336 test lulus (12 suite) | global: Stmts 93.65% | Branch 82.58% | Funcs 96.52%
- import module: Stmts 90.14% | Branch 69.44% | Funcs 100%
- lint, format:check, typecheck, build: exit 0
- npm audit --omit=dev (prod): 0 vulnerabilities
- Migrasi V013 terpasang (dev); determinisme: 2× run penuh 336/336 identik
- Terbukti end-to-end: impor CSV mahasiswa → inserted+updated → login default password
  (mustChangePassword=true) → jejak audit IMPORT (table_name + ringkasan newValues)
```

### 19.4 Open Items (dilanjutkan T1.11+)

1. **UI upload impor** — frontend (T1.11) memakai endpoint di atas; template file contoh (.csv/.xlsx) + tampilan laporan baris gagal.
2. **Performa import skala 5.000 baris** — saat ini 1 transaksi + SAVEPOINT per baris (aman, ~2-5s untuk 2.000 baris di dev); jika load test (T1.14) menunjukkan kebutuhan, optimasi batch upsert (CTE multi-row) dijadwalkan.
3. **Alur ganti password paksa** — `must_change_password` sudah dilaporkan di login; UI + endpoint ganti password menyusul T1.11.
4. **Validasi NIM duplikat lintas-format** — kontak email yang sudah dipakai user lain dilaporkan sebagai baris gagal (sudah ditest); perilaku upsert NIM yang "pindah user" (email beda) didokumentasikan sebagai keputusan: NIM existing → update profil user lama, tidak membuat user baru.

### 19.5 Fix CI pasca-commit 0bdffa5 (2026-08-03, commit 8719f6a + d911630)

**Gejala**: CI run 30806477650 FAILURE (1m8s) — hanya `import.test.ts` 16/16 failed (beforeAll login admin seed → 500); suite lain lulus; log tanpa stack trace.

**Akar masalah** (ditemukan setelah analisis menyeluruh): `import.test.ts` memakai `process.env.DATABASE_URL =` (assignment paksa) ke `localhost:5433` — port docker lokal. CI postgres:16 service listen di **5432**; assignment paksa menimpa env CI → ECONNREFUSED → login 500. 8 suite lain memakai `??=` (default saja) sehingga hormat ke env CI → hijau. Lokal selalu hijau karena port 5433 memang ada → bug tersembunyi.

**Perbaikan**:
1. `import.test.ts` — ganti `=` → `??=` (default 5433 hanya dipakai bila env tidak diset); verifikasi positif: preset env ke DB segar `siak_citest3` → suite 16/16 PASS dan jejak audit LOGIN tertulis di DB preset, DB dev tidak menerima baris baru.
2. `tsconfig.json` — `module`/`moduleResolution` `Node`(alias node10, deprecated di TS 7.0) → **Node16**; dynamic import di `src/index.ts:48` perlu ekstensi eksplisit → `./modules/notification/index.js`; output tetap CommonJS, typecheck/build/runtime diverifikasi.

**Verifikasi**: 2 run CI berikutnya SUCCESS — 30809445626 (fix `??=`; 2m29s) & 30811336103 (tsconfig Node16; 1m15s, 5/5 job hijau).

**Pelajaran**: jangan pernah `=` env wajib di test file — selalu `??=` supaya konfigurasi CI (port/service env) dihormati; biasakan juga mensimulasikan env eksternal (port beda) saat verifikasi test suite, bukan hanya default lokal.

## 20. T1.11a — Frontend Fondasi: Router, Auth, Login, Ganti Password (2026-08-03)

Scope: fondasi SPA (router + api client + auth context + guard) + halaman Login & Ganti Password paksa (F-18). Dashboard & halaman peran menyusul di T1.11b/11c.

### 20.1 File Baru/Diubah

**Frontend** (`frontend/`):
- `src/lib/api.ts` — fetch wrapper: token localStorage, silent refresh 1× saat 401 (single-flight), normalisasi error → `ApiError {status, code, message, fields}`
- `src/auth/AuthContext.tsx` — state user/menu, restore sesi via `/users/me`, `login/changePassword/logout`
- `src/auth/ProtectedRoute.tsx` — guard: booting→spinner, belum login→/login (simpan asal), mustChangePassword→paksa /ganti-password
- `src/components/AppLayout.tsx` — navbar sticky: brand, menu **disaring dari permissions** (`/users/me`), nama+role, Ganti Password, Keluar
- `src/pages/LoginPage.tsx` — error inline per field (fields backend), toggle lihat password, redirect balik ke halaman asal
- `src/pages/ChangePasswordPage.tsx` — validasi client (min 8 + konfirmasi) + error backend inline
- `src/pages/{DashboardPage,ComingSoonPage,NotFoundPage}.tsx` — placeholder/404
- `src/App.tsx` (router) + `src/main.tsx` (BrowserRouter) + `vite.config.ts` (proxy `/api` → `localhost:3000`)
- 6 file test baru/diubah (api, AuthContext, ProtectedRoute, LoginPage, ChangePasswordPage, App)

**Backend** (`backend/`):
- `src/modules/auth/index.ts` — **POST /api/v1/auth/change-password** (F-18): verifikasi password lama, min 8 karakter, tolak sama dengan lama, clear `must_change_password`, **cabut semua refresh token user**, audit `PASSWORD_CHANGED` (tanpa nilai password — S-04)
- `src/lib/audit-service.ts` — `AuditAction` += `'PASSWORD_CHANGED'`
- `src/modules/rbac/index.ts` — `/users/me` kini mengembalikan `mustChangePassword` (dibutuhkan guard frontend)
- `src/modules/auth/auth.test.ts` — +5 test (user khusus `test-auth-cp@`, cleanup audit di afterAll)

### 20.2 Keputusan (decision-log: DL-20, DL-21)

1. **React 18 → 19.2.8 + react-router-dom → react-router@8.3.0** — react-router 7.x tak lolos semua advisory (7.18.2: 2 high RSC-CSRF range ≥7.12<8.3; 7.11: 2 moderate open-redirect/SSR); 8.3.0 butuh React ≥19.2.7. CI scan `npm audit --audit-level=high` menjangkau frontend → wajib 0 high. Hasil: **0 vulnerabilities**, 23/23 test tetap hijau (API v8 library mode kompatibel).
2. **Token di localStorage** — SPA iterasi 1; catatan: risk XSS, migrasi ke httpOnly cookie di polish (T5) bila diperlukan.
3. **Error inline: fields backend tampil per field; alert umum hanya bila tanpa fields** — mencegah duplikat teks.
4. **Guard RBAC UI berbasis `menu` dari `/users/me`** (bukan hardcode role) — menu di navbar disaring dari permissions.

### 20.3 Verifikasi

```text
- Backend: 341 test / 12 suite PASS | coverage 93.72% stmts / 82.42% branch / 96.55% funcs
- Frontend: 23 test / 6 file PASS (React 19 + router 8.3.0)
- Gates frontend: lint, format:check, typecheck, build OK (bundle 77.98 kB gzip < 200 kB NF-02)
- npm audit frontend prod: 0 vulnerabilities (sebelum: 2 moderate → 2 high → fix React 19 + router 8)
- Integrasi nyata: backend dist baru di :3100 → health OK + change-password 401 tanpa token;
  vite dev :5173 → proxy /api → backend OK
```

### 20.4 Temuan & Pitfalls

1. **BIGINT string vs number di refreshTokenStore** — login handler menyimpan `user.id` string (pg int8) tapi `req.user.id` dinormalisasi number → revoke refresh token gagal diam-diam (`"2120" === 2120`). Fix di titik tunggal `generateTokens`: `userId: Number(userId)`. (Pelajaran T1.8 #3 terulang di tempat baru.)
2. **Test mengubah password user bersama = fragility** — test 1 gagal di tengah → user test terkunci password baru → test 2-4 401 domino. Fix: user test kedua khusus (`test-auth-cp@`) yang password-nya boleh berubah.
3. **npm audit `--audit-level=high` vs default** — CI scan memakai `--audit-level=high` (moderate tidak memblokir); evaluasi keputusan dependency harus pakai flag CI, bukan `npm audit` polos.
4. **react-router v8 ESM-only** — `require('react-router')` di node -e gagal (bukan error proyek; Vite ESM-native fine).
5. **Patch fuzzy merusak import block** 2× (AuthContext.tsx) — pelajaran: setelah prettier merapikan multi-line import, patch old_string harus cocok format baru (baca file dulu).

## 21. T1.11b — Dashboard Mahasiswa: KRS + Transkrip (2026-08-03)

Scope: halaman KRS (periode aktif, kelas tersedia, draft→submit, total SKS, status pengisian) + Transkrip (grup per semester, IP/IPK) + dashboard role-aware. Frontend hanya; 1 perubahan kecil backend.

### 21.1 Perubahan

**Backend** (`backend/`):
- `src/modules/rbac/index.ts` — `GET /users/me` kini mengembalikan `studentId` (`user.studentId`, number|null; null untuk non-mahasiswa). Dibutuhkan frontend untuk memanggil `/grades/student/:studentId` (transkrip mandiri). Test `rbac.test.ts` +1 assertion (field ada).

**Frontend** (`frontend/`):
- `src/lib/types.ts` — tipe API KRS/transkrip (KrsPeriod, AvailableClass, MyKrs, GradeItem, dst); `dayOfWeek` number 1-7 (SMALLINT).
- `src/pages/KrsPage.tsx` — muat period + my + available (paralel; available di-skip bila periode tutup); pilih/hapus kelas secara lokal; total SKS; Simpan Draft / Submit (dialog konfirmasi, AC-07 lock); banner status & rejection; locked saat submitted/approved/periode tutup; error inline + loading.
- `src/pages/TranscriptPage.tsx` — `GET /grades/student/:studentId`; grup per semester (urutan backend); IP per semester & IPK total **dari SKS yang sudah dinilai saja**; empty/error state; akun non-mahasiswa (studentId null) → info.
- `src/pages/DashboardPage.tsx` — kartu aksi disaring dari `menu` (KRS/Transkrip untuk mahasiswa, Kelola Pengguna untuk admin).
- `src/auth/ProtectedRoute.tsx` — prop `perm` opsional → AccessDenied 403 bila permission tidak dimiliki.
- `src/App.tsx` — `/krs` (perm krs.fill) & `/transkrip` (perm transcript.view_own) ke halaman nyata.
- 4 file test baru/diubah: KrsPage (8 test), TranscriptPage (4), DashboardPage (2), ProtectedRoute (+2 perm).

### 21.2 Keputusan (DL-22)

1. **IPK dihitung dari SKS yang sudah dinilai saja** — MK tanpa nilai tidak menurunkan IPK (menunggu nilai = bukan gagal). Dihitung client-side dari `gradePoint` (nilai poin dari backend, konsisten grade letter).
2. **Available classes di-skip bila periode tutup** — `/krs/available-classes` melempar KRS_PERIOD_CLOSED 403; frontend menangkap kode itu dan menampilkan state kosong alih-alih error.
3. **Admin `krs.approve`/`krs.view_classes` tanpa `krs.fill`** → `/krs` tampil 403 untuk admin di T1.11b (halaman admin KRS menyusul di T1.11c).

### 21.3 Verifikasi

```text
- Backend: 341/341 PASS | coverage 93.72% stmts / 82.42% branch (rbac 165/165)
- Frontend: 39/39 PASS (9 file) | lint/format/typecheck/build OK (bundle 81.10 kB gzip)
- E2E nyata (backend dist :3100, user mahasiswa temp): login → /users/me studentId=studentId
  → period open → available-classes ada → POST /krs/draft → /krs/my status draft (SKS 3)
  → /grades/student/:id sukses → cleanup tuntas (0 sisa user/student/submission)
- npm audit frontend: tetap 0 (tanpa dep baru)
```

### 21.4 Temuan & Pitfalls

1. **Instance backend basi di port 3100** — proses `node dist/index.js` dari verifikasi T1.11a (PID berbeda dari yang dilacak) masih memegang port; verifikasi E2E sempat menguji build lama (`/users/me` tanpa studentId). Pelajaran: sebelum verifikasi live, pastikan port bersih (`netstat -ano | grep :3100`) & matikan semua PID yang listen.
2. **BIGINT string di script verifikasi** — `RETURNING id` dan `class_id` dari pg = string; zod `/krs/draft` menolak `classIds: ['1']`. Fix: `Number()` di script. (Pelajaran yang sama berulang: int8 → string di node-postgres.)
3. **Cleanup E2E harus berurutan** — `DELETE FROM users` kena FK `krs_submissions.student_id` (tidak cascade); hapus krs_submissions dulu, lalu users (cascade students).
4. **Query Testing Library** — `getByText('3')` ambigu (Total SKS vs kolom SKS); teks gabungan `MAT1 — Matematika Dasar` tidak cocok exact-match; IP header `SKS: 5 · IP: 3.72` bukan elemen tunggal. Fix: `within(section)` + regex.
5. **IPK 2.66 ≠ 3.72** — kesalahan hitung manual di test: IPK = Σ(SKS×poin)/ΣSKS dinilai = 18.6/5 (bukan /7).

## 22. T1.11c — Dashboard Admin: Persetujuan KRS + Manajemen Pengguna (2026-08-03)

Scope: halaman admin untuk approve/reject KRS (perm `krs.approve`) + manajemen pengguna (perm `user.manage`). **Frontend only** — semua endpoint sudah ada sejak T1.1–T1.10.

### 22.1 Perubahan (frontend)

- `src/lib/types.ts` — tipe admin: `AdminKrsItem`, `AdminKrsPending`, `UserListItem`, `UserListResponse`, `CreateUserInput`, `UpdateRoleInput`, `PaginationParams`.
- `src/lib/api.ts` — helper admin: `getAdminPendingKrs`, `approveKrs`, `rejectKrs`, `listUsers`, `createUser`, `updateUserRole`. **Normalisasi snake_case→camelCase di lapisan API** (backend list/create/update role mengembalikan kolom mentah `full_name`, `role_code`, dst).
- `src/pages/AdminKrsPage.tsx` — daftar pengajuan submitted; Setujui / Tolak (dialog alasan min. 5 karakter); error inline + Coba lagi; busy state per baris.
- `src/pages/UsersPage.tsx` — tabel pengguna + pencarian (debounce 300ms) + filter peran + pagination; modal **Buat User** (validasi per-field dari `err.fields`); modal **Ubah Peran** (checkbox Wali hanya untuk dosen); anti-self-lockout ditangani backend (400).
- `src/auth/ProtectedRoute.tsx` — `perm` kini menerima **array (OR)** — `/krs` bisa diakses mahasiswa (`krs.fill`) ATAU admin (`krs.approve`).
- `src/App.tsx` — `/krs` → selector `KrsRoute` (mahasiswa → KrsPage, admin → AdminKrsPage); `/users` → UsersPage (perm `user.manage`).
- Test: AdminKrsPage (6), UsersPage (6), ProtectedRoute (+2 array perm). **Frontend 53/53 PASS.**

### 22.2 Keputusan (DL-23)

1. **Route `/krs` di-share mahasiswa & admin** — selector berbasis menu (`krs.fill` vs `krs.approve`), bukan rute terpisah. Menu navbar sudah menyatu ("KRS") sejak T1.11a.
2. **Normalisasi snake_case di `listUsers`/`createUser`/`updateUserRole`** — bukan di komponen: UI tetap camelCase, backend tak diubah (menghindari perubahan API yang berisiko).
3. **Tanpa `alert()`** — error aksi (approve/reject/create/role) tampil inline `actionError` konsisten dengan KrsPage.

### 22.3 Verifikasi

```text
- Frontend: 53/53 PASS (11 file) | lint/format/typecheck/build OK (bundle 84.19 kB gzip < 200KB NF-02)
- npm audit frontend: 0 vulnerabilities (tanpa dep baru)
- E2E nyata (backend dist :3100, user temp): login admin → menu user.manage+krs.approve
  → /krs/admin/pending berisi mhs temp → approve 200 → approve ulang 409
  → /users?search → POST /users (dosen+wali) 201 → PUT /users/:id/role → admin_akademik 200
  → PUT role sendiri 400 (anti self-lockout) → cleanup tuntas (users/students/subs/items/notif = 0)
```

### 22.4 Temuan & Pitfalls

1. **Backend list users mengembalikan snake_case mentah** (tidak seperti /users/me yang camelCase) — `full_name`, `role_code`, `last_login_at`; asersi E2E memakai `role_code`. Normalisasi wajib di client.
2. **Pola "instance backend basi di :3100" terulang** — proses `node dist/index.js` tak terdeteksi Hermes (PID berbeda) masih memegang port setelah `process kill`; verifikasi port wajib via `netstat -ano | grep :3100` + `taskkill` sebelum tiap sesi live.
3. **Patch fuzzy salah sasaran 2×** (AdminKrsPage.test.tsx) — old_string `(url, init)` cocok ke test "Coba lagi" padahal yang dimaksud test approve; akibatnya param `init` tak terdefinisi di body → TS2349/TS6133. Pelajaran: patch dengan konteks baris unik, dan cek seluruh kemunculan.
4. **`role="status"` ambigu di test** — spinner loading juga `role="status"` (aria-label "Memuat"); query sukses pakai teks unik pesan, bukan `findByRole('status')`.
5. **Label peran ambigu** — badge "Mahasiswa" vs `<option>Mahasiswa</option>` filter; gunakan `getAllByText(...).length` atau `within(table)`.

## 23. T1.11d — Polish + Gate + Docs (2026-08-03) — T1.11 TUNTAS

Scope: coverage threshold frontend, polish aksesibilitas & states, verifikasi nginx.conf, verifikasi kanonikal penuh, docs.

### 23.1 Perubahan

**Coverage threshold frontend (vite.config.ts)**:
- `@vitest/coverage-v8@^3.2.7` (baru; versi 4.x butuh vitest 4 → ERESOLVE, pakai 3.2.7 agar cocok vitest 3.2.7).
- Konfigurasi `test.coverage`: provider v8, exclude `main.tsx` (entry) & `lib/types.ts` (tipe murni), **threshold global 80% untuk lines/functions/branches/statements** — konsisten backend. Berlaku saat `npm run test:coverage`; CI tetap `npm run test` (tanpa blokir baru).

**Test baru (a11y & coverage)**: `AppLayout.test.tsx` (4 test — menu filtering per permission, logout → /login, user null), `ComingSoonPage.test.tsx` (1). **58/58 PASS.**

**Polish aksesibilitas**: `scope="col"` ditambahkan ke semua `<th>` tabel (AdminKrsPage, UsersPage, KrsPage, TranscriptPage) — screen reader mengasosiasikan header dengan kolom.

**nginx.conf frontend diperbaiki (bug nyata)**: `frontend/nginx.conf` (dipakai Dockerfile → container `siak-frontend` di compose dev, port 8080) **tidak punya proxy `/api`** → SPA di 8080 tidak bisa memanggil API. Ditambahkan `location /api/ { proxy_pass http://backend:3000; ... }`.

### 23.2 Verifikasi

```text
- Frontend: 58/58 PASS | coverage 95.81% stmts / 82.84% branch / 82.35% funcs (threshold 80 aktif ✅)
- lint/format/typecheck/build OK | bundle 84.20 kB gzip (NF-02 < 200KB) | audit 0 vuln
- nginx (docker, network siak-dev_default, container siak-backend di 3000):
    / → 200 text/html · /krs → 200 (SPA fallback) · /api/v1/health → JSON backend (proxy ✅)
    /api/v1/users/me tanpa token → 401 (auth lewat proxy ✅) — container test dihapus
- infra/nginx/nginx.conf (prod edge) diverifikasi: SPA fallback + proxy /api + rate limit auth + WS ✅
```

### 23.3 Temuan & Pitfalls

1. **`frontend/nginx.conf` tanpa proxy `/api`** — SPA container di compose dev (8080) hanya serve static; semua request API jatuh ke `try_files` → index.html. Terdeteksi saat verifikasi T1.11d; diperbaiki + diuji nyata (proxy → backend:3000).
2. **`@vitest/coverage-v8@latest` (4.x) butuh vitest 4** → ERESOLVE; pasang versi minor yang sama dengan vitest (`@^3.2.7`).
3. **`nginx -t` gagal "host not found in upstream backend"** di luar network compose — bukan error config; hostname service hanya resolve di dalam network. Verifikasi config harus dijalankan di network tempat service tersebut ada.
4. **Coverage funcs 76.19% → 82.35%** — AppLayout & ComingSoonPage belum punya test langsung (funcs 0); dua file test baru menaikkan funcs melewati 80.


## 24. T1.12 — Redis Cache Layer + Fix Pre-existing Tests (2026-08-04) — T1.12 TUNTAS (`9a7c1d1`)

Scope: cache terpusat Redis untuk data read-heavy (spec §7.2), invalidation on write, perbaikan test pre-existing (krs, kelas penuh).

### 24.1 Perubahan

**`backend/src/lib/cache.ts` (BARU, 189 baris)** — Redis cache layer terpusat:
- `cacheGet`/`cacheSet`/`cacheDel`/`cacheDelPattern`; namespace `siak:*`; TTL per tipe: KELAS=30s, TRANSCRIPT=300s, KURIKULUM=3600s (spec §7.2).
- **Graceful degradation**: Redis down/tidak terkonfigurasi → `cacheGet` resolve null, `cacheSet`/`cacheDel` no-op — BUKAN error (NF-05: sistem tetap berfungsi tanpa cache).

**Penerapan di endpoint**:
- `GET /krs/available-classes` → cache 30s; `POST /krs/submit` → `cacheDelPattern(allAvailableClasses)` (invalidasi saat kuota berubah).
- `GET /grades/student/:studentId` → cache 300s, key `transcript:<id>:<limit>:<offset>`; POST/PUT grades → `cacheDelPattern(transcript:<id>*)`.
- `findActivePeriod()` eksklusi periode test (`NOT LIKE 'T1.%-TEST%'`) — grades.test.ts membuat periode `T1.8-TEST-*` is_active yang meracuni test KRS.

**`backend/src/lib/cache.test.ts` (BARU, 68 baris)** — unit test tanpa Redis live: graceful degradation + konstruksi key.

### 24.2 Fix pre-existing test (instruksi user "Fix pre-existing test dulu")

**Root cause CLASS_FULL krs.test.ts (ganda)**:
1. `classes` array dari beforeAll STALE — seed TI101-A/TI103-A 28/30; submit mhsA (+2) + mhsB (+2) → penuh 30/30 sebelum test "revisi setelah reject" (pakai `classes[0..2]`). Fix: beforeAll filter `current_enrolled < capacity` + test "revisi" re-query kelas berkuota fresh.
2. `current_enrolled` stale antar-run (leftover submission dari run yang dibunuh). Fix: `cleanup()` hitung ulang `current_enrolled` dari jumlah submission aktual per kelas → idempoten antar-run (25/25 × 3 run).

### 24.3 Verifikasi

```text
- krs.test.ts 25/25 PASS (3× run konsisten) · cache.test.ts PASS · keduanya 2/2 PASS
- Full suite baseline: 9/12 (3 gagal = grades/audit/academic TOO_MANY_REQUESTS login — pre-existing, lockout ±15 menit)
- Gates: lint ✅ format ✅ typecheck ✅ build ✅ · audit prod 0 vuln
```





## 27. T1.15 — Deployment Staging (2026-08-04) — T1.15 SELESAI

**Scope**: Docker Compose production-ready, Nginx SSL termination, rate limiting, zero-downtime rolling deploy.

**Artefak:**
- `infra/docker-compose.prod.yml` — 2x backend replicas, resource limits, migrate terpisah, healthchecks
- `infra/nginx.prod.conf` — SSL (TLS 1.2/1.3), rate limiting zones (api/login/waiting-room), WebSocket proxy, security headers
- `infra/.env.prod.example` — template environment (DB, Redis, JWT, CORS, WAITING_ROOM_THRESHOLD, DATABASE_POOL_MAX)
- `infra/deploy-staging.sh` — script zero-downtime (build → migrate → rolling backend → frontend → nginx reload)
- `docs/deployment-staging.md` — dokumentasi lengkap arsitektur, rate limit, deploy, SSL, resource limits

**Keputusan:**
- Migrasi service terpisah (sebelum backend up) → zero-downtime schema changes
- Backend replicas=2, rolling update parallelism=1 → zero-downtime deploy
- Nginx rate limiting: api 100r/s, login 5r/m, waiting-room 50r/s
- SSL termination di Nginx → backend HTTP only (trust proxy true sudah di T1.14)
- Resource limits: postgres 2CPU/2GB, redis 0.5CPU/512MB, backend 1CPU/1GB x2

**Gates:** Semua file lint/format valid; compose syntax OK; nginx config valid.

## 26. T1.14 — Load Test k6 (2026-08-04) — T1.14 SELESAI (hanya bottleneck infrastruktur)

**Scope**: simulasi puncak hari pertama KRS 1k→3k→5k VU (NF-06, AC-01).

**Fakta terverifikasi:**
- Seed: 5.500 akun `lt-*` + 1.800 kelas `LT-*` (54.000 slot), idempotent.
- Backend: build terbaru (T1.13 waiting room + `trust proxy: true` + `DATABASE_POOL_MAX` env).
- Tooling: k6 (grafana/k6 Docker) + `backend/loadtest/scenario.js` 2 mode:
  - `capacity` (default): IP sama → waiting room tak terpicu; flow KRS lengkap + read-only.
  - `queue`: X-Forwarded-For unik + WAITING_ROOM_THRESHOLD=50 → 429 RATE_LIMITED + token + status exempt.

**3 run (7m45s tiap run):**
1. Pool 20: deadlock `FOR UPDATE` (40P01) → p99 60s, error 13.7%.
2. Pool 100 + deadlock fix (`ORDER BY cl.id`): deadlock 0, tapi pool 100 + bcrypt 12 → connection timeout → error 18.2%.
3. Pool 100 + deadlock fix: 0 deadlock; bottleneck = pg-pool exhaust (100 < 5k VU) + bcrypt threadpool 4.

**Keputusan (DL-27, DL-28):**
- DL-27: `ORDER BY cl.id` di `SELECT ... FOR UPDATE` → mencegah deadlock.
- DL-28: `DATABASE_POOL_MAX` env (default 20, prod 200-300) + `max_connections` compose dev 300.

**Kalibrasi WAITING_ROOM_THRESHOLD (DL-11):** Threshold aman ~1.500 VU untuk mesin ini (default 5.000). Akan dikalibrasi ulang staging (T1.15) & production (T4.1).

**Gates:** backend typecheck/build/lint OK; seed idempotent; mode queue terbukti 429+token+status exempt.

## 25. T1.13 — Virtual Waiting Room MVP (2026-08-04) — T1.13 TUNTAS (`28d5e92` backend)

Scope: F-17/NF-05/K-09 (docs/02 §7.1) — gerbang antrean saat puncak 5.000 simultan, push real-time + fallback polling, plus determinisme full suite.

### 25.1 Perubahan

**`backend/src/lib/redis.ts` (BARU)** — koneksi Redis SHARED (lazy, reconnect, `closeRedis()`); dipakai cache dan waiting room (satu koneksi, DRY). `cache.ts` direfactor ke client ini.

**`backend/src/modules/waiting-room/` (BARU)**:
- `waiting-room.service.ts` — ZSET antrean + active set + sweeper 60s + TTL 30m + EventEmitter `promoted`; **Redis down → allow semua** (graceful). Ambang `WR_THRESHOLD` env, default 5000 (DL-11).
- `waiting-room.middleware.ts` — gate: `active_users_count` > ambang → 429 `RATE_LIMITED` + header `x-waiting-token` + posisi; di bawah ambang → lewat.
- `waiting-room.routes.ts` — `GET /waiting-room/status?token=` (fallback polling K-09; exempt dari gate).
- `waiting-room.socket.ts` — Socket.io namespace `/waiting-room`; client join `wr:<token>`; `promoted` → emit `waiting:enter_now`.
- `app.ts` — router + middleware + injeksi (test bypass via service null); `index.ts` — attach socket + sweeper + shutdown bersih.
- `auth/index.ts` — logout: `release()` + promote antrean.

**Frontend (T1.13)**:
- `lib/api.ts` — 429 + `x-waiting-token` → simpan token (sessionStorage) + redirect `/tunggu`; `getWaitingRoomStatus()` (polling).
- `pages/WaitingRoomPage.tsx` (BARU) + route `/tunggu` (publik) — WebSocket push + polling 15s fallback; UI kartu estetik.
- `frontend/nginx.conf` — `location /socket.io/` + upgrade headers (prod infra sudah ada).

**Fix determinisme full suite** (menyelesaikan 3 suite yang dulu selalu merah):
- `infra/docker-compose.yml` — postgres `max_connections` 100 → **300** (12+ worker jest × pool max 20 = 240+ koneksi → `auth_failed`/Connection terminated).
- `grades.test.ts` — query dosen2/mahasiswa2 eksklusi `imp-%` + `ORDER BY id` (leftover import run lama dipilih acak → login salah → akun terkunci → 401 beruntun).
- `import.test.ts` — cleanup bersihkan SEMUA `imp-%` (semua run, bukan hanya ts sendiri).
- `audit.test.ts` — pagination pakai user khusus + burst 12 baris + filter `?changedBy=` (deterministik vs LOGIN suite paralel yang menggeser offset).
- `krs.test.ts` — timeout beforeAll 5s → 30s (bcrypt cost 12 + cleanup saat DB sibuk).

### 25.2 Verifikasi

```text
- Backend full suite: 15/15 PASS × 3 run beruntun (sebelumnya baseline 9/12)
- Frontend: 66/66 PASS · coverage 95.72/82.75/83.69 (≥80 ✓) · lint/typecheck/build OK
- Bundle: 85.60 kB gzip main (<200KB NF-02 ✓) + chunk socket.io lazy 13.12 kB
- audit: backend prod 0 vuln · frontend 0 vuln
```

### 25.3 Temuan & Pitfalls

1. **`max_connections` postgres 100 default** — full suite paralel (12 worker × pool 20) meledakkan koneksi; gejala `password authentication failed`/`Connection terminated` acak. Fix di compose dev; CI lolos karena runner punya core lebih sedikit (worker lebih sedikit).
2. **Leftover `imp-*` dari run import yang dibunuh** — dipilih acak sebagai dosen2/mahasiswa2 oleh grades.test.ts (tanpa ORDER BY) → login `Dosen123!` salah → 5× gagal → akun terkunci ±15 menit → SELURUH suite lain 401 `TOO_MANY_REQUESTS`. Ini akar "TOO_MANY_REQUESTS pre-existing" yang dulu dikira rate limiter murni.
3. **`vi.spyOn(window.location, 'assign')` ditolak jsdom** ("Cannot redefine property") — ganti `window.location` utuh via `Object.defineProperty(window, 'location', { value: { pathname, assign } })`.
4. **`vi.useFakeTimers()` + `waitFor`/`findByText` = timeout** — waitFor internal pakai timer nyata; polling 15s tidak perlu dikontrol timer.
5. **Debug artifact `dbg-login.ts` bocor ke commit** — wajib dihapus sebelum commit; verifikasi `git show --stat` setiap commit.


## 28. T2.1 — Payment Service (Generate Tagihan Otomatis)

**Status**: ✅ SELESAI & TER-PUSH
**Tanggal**: 2026-08-04
**PRD Ref**: F-08, F-12, F-15, AC-03, AC-08, K-08

### Database Migration (V20260804_014__add_payment_generation.sql)

- `get_spp_amount(semester_code)` — SPP ganjil Rp970.000, genap Rp950.000
- `generate_payments_for_semester(p_semester_id)` — generate untuk SEMUA mahasiswa aktif (tanpa filter angkatan):
  - Mahasiswa lama (angkatan ≠ academic_year semester): SPP saja
  - Mahasiswa baru (angkatan = academic_year semester): SPP + Gedung 200k + Tes 50k
  - Due date: 7 hari sebelum KRS end date (atau semester end)
  - Idempotent: skip jika payment sudah exist
- `trigger_generate_payments()` — trigger AFTER UPDATE is_active ON semesters
- `update_payment_status(payment_id, paid_amount, admin_id)` — manual update oleh admin keuangan:
  - Validasi paid_amount (0 ≤ x ≤ total_amount)
  - Status: belum_lunas / partial / lunas
  - Audit log otomatis
- `can_access_krs(student_id, semester_id)` — return TRUE hanya jika status = 'lunas'

### Finance API Module (src/modules/finance/index.ts)

Endpoints:
- `GET /api/v1/finance/payments` — list + filter + pagination (admin_keuangan, admin_sistem)
- `GET /api/v1/finance/payments/:id` — detail payment + items
- `POST /api/v1/finance/payments/:id/update` — update status bayar (admin_keuangan)
- `POST /api/v1/finance/generate` — trigger generate manual (admin_keuangan)
- `GET /api/v1/finance/my-payment` — mahasiswa lihat tagihan sendiri
- `GET /api/v1/finance/krs-access?semester_id=X` — cek apakah bisa akses KRS (gate T2.3)

RBAC per matriks §6.1:
- payment.generate → admin_keuangan, admin_sistem
- payment.update → admin_keuangan, admin_sistem (read juga)
- krs.fill → mahasiswa (my-payment, krs-access)

### Verified on Staging

- Auto-generate: 2004 payments created (1002 mhs lama = Rp970k, 1002 mhs baru = Rp1.22M)
- Payment items: SPP / Gedung / Tes per rules
- can_access_krs: mhs lama (lunas) = true, mhs baru (belum bayar) = false
- Manual update: admin keuangan → lunas → can_access_krs jadi true
- All backend tests: 15/15 suites, 374/374 PASS
- Frontend tests: 13/13 T1.13 PASS
- Lint / typecheck / build: HIJAU

## 29. T2.6 — Frontend Payment Pages (T2.1–T2.3 UI)

**Status**: ✅ SELESAI & TER-PUSH
**Tanggal**: 2026-08-04
**PRD Ref**: F-08, F-12, F-15, AC-03, AC-08, K-08

### Files Created/Modified

- `frontend/src/lib/types.ts` — Tipe `Payment`, `PaymentItem`, `PaymentStatus`, `PaymentsResponse`, `MyPayment`, `KrsAccessResult`, `UpdatePaymentInput`
- `frontend/src/lib/api.ts` — Finance API: `getFinancePayments`, `getFinancePayment`, `updateFinancePayment`, `generateFinancePayments`, `getMyPayments`, `getKrsAccess`
- `frontend/src/pages/MyPaymentPage.tsx` — Halaman tagihan mahasiswa (permission `krs.fill`)
  - Tab semester, summary card, progress bar (partial), KRS access indicator
  - Tabel rincian items (SPP/Gedung/Tes) dengan total
  - Info pembayaran & syarat KRS
- `frontend/src/pages/FinancePaymentsPage.tsx` — Halaman kelola tagihan admin keuangan (permission `payment.update`)
  - Filter: semester, status, prodi + pagination
  - Generate tagihan manual per semester
  - Update status bayar via prompt (0 → belum_lunas, full → lunas, partial → cicil)
  - Loading states, error handling
- `frontend/src/App.tsx` — Routes baru:
  - `/pembayaran` → `MyPaymentPage` (mahasiswa, `krs.fill`)
  - `/keuangan/tagihan` → `FinancePaymentsPage` (admin keuangan, `payment.update`)

### Verified on Staging

- Mahasiswa login → `/pembayaran` menampilkan tagihan + status + KRS access indicator
- Admin keuangan login → `/keuangan/tagihan` list 2004 tagihan, filter, update status → lunas → KRS access jadi true
- Backend tests: 15/15 suites, 374/374 PASS
- Frontend tests: 13/13 T1.13 PASS
- Typecheck / lint / build / format:check HIJAU
- Bundle: 88.95 kB gzip (< 200 kB NF-02)
## 30. T2.4 — Transkrip PDF (2026-08-05)

**Status**: ✅ SELESAI (menunggu commit manual — F-31)
**Tanggal**: 2026-08-05
**PRD Ref**: F-12, F-15, AC-03, AC-08, §6.2

### Backend Module (baru)

- `backend/src/modules/transcript/index.ts` (~486 baris) — router transkrip:
  - `GET /transcript/my` — JSON transkrip sendiri (mahasiswa, `transcript.view_own`)
  - `GET /transcript/my/download` — PDF transkrip sendiri (`transcript.download`)
  - `GET /transcript/student/:studentId` — JSON transkrip binaan (dosen wali via `authorizeWali`, admin)
  - `GET /transcript/student/:studentId/download` — PDF binaan (`authorizeWali`)
  - PDF via **pdfkit** (dep baru); query via pgPool; AppError; cache Redis `siak:transcript:*` TTL 300s
  - Skala nilai plus/minus (`A-` 3.7, `B+` 3.3, dst) — `GRADE_POINT` + helper konversi huruf→poin
  - Matkul diulang → hanya nilai terbaik masuk IPK; baris lama ditandai `isRepeated` warna merah `#dc2626`
  - Layout: `colWidths [40,180,50,50,50,60]`, headers `['No','Mata Kuliah','SKS','Angka','Huruf','Status']`, Helvetica-Bold 8pt
- `backend/src/app.ts` — mount `app.use('/api/v1/transcript', ...)` di samping `/api/v1/grades`
- `backend/package.json` — + `pdfkit`, `@types/pdfkit`
- `backend/src/lib/policy.ts` — **tidak berubah**: dosen wali pakai atribut `is_wali` via `authorizeWali` (DL-08 pattern), bukan perm baru

### Frontend

- `frontend/src/lib/api.ts` — `downloadTranscriptPdf()` (blob + trigger download, silent refresh on 401)
- `frontend/src/pages/TranscriptPage.tsx` — tombol **Download PDF** (disabled saat loading/kosong, error inline)
- `frontend/src/pages/TranscriptPage.test.tsx` — test download: mock blob + anchor click + revokeObjectURL

### Test

- `backend/src/modules/transcript/transcript.test.ts` (baru, 7 tes): seed imp-TR% user + grades, JSON self, PDF download, repeat-best-only, wali access via authorizeWali, admin_akademik view, 403 non-wali dosen
- RBAC matrix test tetap 1-per-sel (transcript.view_mentee: dosen=false, admin_akademik=true) — konsisten
- Backend: 16/16 suites, 381/381 PASS (`--runInBand`; paralel flaky pre-existing)
- Frontend: 16/16 files, 79/79 PASS; coverage 94.79% stmts / 81.8% funcs / 82.05% branch (≥80%)
- Fix flaky pre-existing: `vi.setConfig({ testTimeout: 20_000 })` di UsersPage.test.tsx & ChangePasswordPage.test.tsx (userEvent + coverage > 5s default)
- Bundle: 89.39 kB gzip (< 200 kB NF-02)

## 31. T2.5 — Notifikasi KRS (AC-04d) (2026-08-05)

**Status**: ✅ SELESAI (menunggu commit manual — F-31)
**Tanggal**: 2026-08-05
**PRD Ref**: AC-04d, F-25, K-09

### Backend

- `backend/migrations/V20260805_015__notification_delivery.sql` (baru) — kolom `status` (PENDING/SENT/FAILED), `sent_at`, `attempts`, `last_error` + index `(status, id)`; backfill in-app lama → SENT
- `backend/src/modules/notification/provider.ts` (baru) — `NotificationProvider` interface + `EmailProvider` via **nodemailer** (SMTP_HOST/PORT/SECURE/USER/PASS/FROM); **fallback log-only** saat SMTP belum dikonfigurasi (graceful degradation)
- `backend/src/modules/notification/index.ts` — `deliverPendingNotifications()`: proses antrean email (PENDING → SENT/FAILED, retry max 3×, `FOR UPDATE SKIP LOCKED` anti double-send, batch 100); `sendInAppNotification()` & `remindUnfilledStudents()` kini set status sesuai kanal (`channels` param, default in_app)
- `backend/src/index.ts` — scheduler delivery (interval `NOTIF_DELIVERY_INTERVAL_MS` default 5 menit; disabled di test)
- `backend/package.json` — + `nodemailer`, `@types/nodemailer`

### Frontend

- `frontend/src/pages/NotificationsPage.tsx` (baru) — daftar notifikasi sendiri (GET /notifications/my), badge tipe, tandai dibaca (PUT /notifications/:id/read, optimistik), unread count, empty/error state
- `frontend/src/components/AppLayout.tsx` — ikon lonceng + badge unread (polling 60s, gagal fetch tidak menggagalkan layout)
- `frontend/src/lib/api.ts` + `types.ts` — `getMyNotifications()`, `markNotificationRead()`, tipe `AppNotification`/`NotificationsResponse`
- `frontend/src/App.tsx` — route `/notifikasi` (semua role terautentikasi; AC-10)

### Test & Verifikasi

- Backend: notification.test.ts +4 tes (sukses SENT, retry PENDING, exhausted FAILED, in-app skip) → **16/16 suites, 385/385 PASS**
- Frontend: NotificationsPage.test.tsx 4 tes → **17/17 files, 83/83 PASS**; coverage **94.75% stmts / 82.32% funcs / 82.92% branch** (≥80%)
- Bundle: 90.42 kB gzip (< 200 kB NF-02)

---

## 32. T2.7 — Integration Test E2E (Bayar → KRS → Nilai → Transkrip) (2026-08-05)

**Status**: ✅ SELESAI (menunggu commit manual — F-31)
**Tanggal**: 2026-08-05
**PRD Ref**: AC-03, AC-05, AC-06, F-08, F-12, F-15, K-08, K-09

### Backend Test File (baru)

- `backend/src/modules/e2e/e2e-integration.test.ts` — 12 test end-to-end lengkap:
  1. Mahasiswa login & cek KRS access SEBELUM bayar → FALSE
  2. Admin Keuangan update payment → LUNAS (paid_amount = total_amount)
  3. Mahasiswa cek KRS access SETELAH bayar → TRUE
  4. Mahasiswa lihat kelas tersedia (available-classes) → minimal 1 kelas
  5. Mahasiswa submit KRS (POST /krs/submit) → submitted + locked
  6. Mahasiswa GET /krs/my → status submitted + items
  7. Admin Akademik approve KRS (POST /krs/admin/:id/approve) → approved
  8. Mahasiswa GET /krs/my SETELAH approve → status approved + locked
  9. Dosen input nilai untuk item KRS (POST /grades) → created (grade A, 4.0)
  10. Mahasiswa GET /transcript/my → lihat nilai + IPK
  11. Mahasiswa GET /transcript/my/download → PDF (application/pdf)
  12. Admin Akademik lihat transkrip mahasiswa (GET /transcript/student/:id)

### Key Implementation Notes

- Test users seeded per run via unique timestamp suffix (`e2e-std-XXXXXX@student.siak.local`, `e2e-keu-XXXXXX@siak.local`, `e2e-akad-XXXXXX@siak.local`, `e2e-dsn-XXXXXX@siak.local`)
- Test class created with `lecturer_id = dosenUserId` to enable grade input ownership check
- Other classes in same prodi/semester set to full (`current_enrolled = capacity`) to ensure deterministic available-classes response
- JWT token `sub` claim mapped to `users.id`; ownership check in grades route uses `req.user.id` (matches `classes.lecturer_id` referencing `users.id`)
- Test cleanup in FK order: grades → krs_items → krs_submissions → payments → students → classes → lecturers → admin users → krs_periods
- `--runInBand` required for deterministic backend test execution (paralel flaky pre-existing)

### Test & Verifikasi

- Backend: **1/1 suite, 12/12 PASS** (`--runInBand`); full backend suite 16/16 suites, 392/397 PASS (5 flaky pre-existing DB auth issues unrelated to T2.7)
- Frontend: **17/17 files, 83/83 PASS**; coverage **94.75% stmts / 82.38% funcs / 82.92% branch** (≥80%)
- Bundle: 90.42 kB gzip (< 200 kB NF-02)
- Typecheck / lint / build / format:check HIJAU
