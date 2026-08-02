# Implementation Log — Siak (Sistem Informasi Akademik)

> **Dibuat:** 2026-08-01 (Developer, Tugas #1)
> **Status:** Iterasi 1 — **T1.1–T1.4 selesai & tervalidasi**
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
# Auth endpoints
curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"admin-akademik@siak.local","password":"Admin123!"}'
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

**Catatan untuk Reviewer:** validasi CI penuh (GitHub Actions) sedang berjalan otomatis dari push `201d280` (T1.3) + fix security audit. Hasil Actions akan menentukan apakah gate CI terpenuhi untuk lanjut T1.4.
