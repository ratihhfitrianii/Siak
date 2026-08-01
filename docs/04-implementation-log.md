# Implementation Log — Siak (Sistem Informasi Akademik)

> **Dibuat:** 2026-08-01 (Developer, Tugas #1)
> **Status:** Iterasi 1 dimulai — **T1.1 (Setup repo monorepo + Docker + CI) selesai & tervalidasi**
> **Referensi:** `docs/02-solution-spec.md` (DRAFT — menunggu APPROVE SPECIFICATION), `docs/03-execution-plan.md` (DRAFT), `docs/decision-log.md`

---

## 1. Ringkasan Sesi Ini

Developer menyelesaikan **T1.1 — Setup repo monorepo (backend + frontend + infra), Docker, CI pipeline** sesuai `docs/03-execution-plan.md` (DoD: `docker compose up` jalan; GH Actions lint+typecheck+test pass — bagian CI diverifikasi secara lokal karena repo belum di-push).

### 1.1 Asumsi Eksplisit (Gate)

1. **Interpretasi gate APPROVE SPECIFICATION:** dokumen `docs/02` dan `docs/03` masih berstatus *DRAFT — menunggu APPROVE SPECIFICATION* (tercatat di `docs/project-status.md` Open Items #1). Prompt tugas pemilik *"Implementasi sesuai docs/02-solution-spec.md dan docs/03-execution-plan.md"* ditafsirkan Developer sebagai **persetujuan untuk memulai implementasi** (approval implisit). Developer tetap mencatat status dokumen yang belum di-approve secara formal di artefak ini dan `docs/project-status.md`. **Jika pemilik belum bermaksud approve, keputusan ini perlu dikonfirmasi** (lihat §9 Risiko).
2. **Repo git belum diinisialisasi** (temuan Coordinator 2026-08-01). Sesuai F-31, Developer **tidak** menjalankan `git init`/`git commit`/`git push`; file CI (`.github/workflows/ci.yml`) disiapkan dan akan aktif setelah pemilik menginisialisasi repo + remote. Validasi gate lint/typecheck/test/build dijalankan secara lokal sebagai pengganti CI.
3. **Scope sesi:** T1.1. Task T1.2–T1.15 Iterasi 1 belum dikerjakan dan akan dilanjutkan di sesi berikutnya (sesuai brief handoff: *"mulai Iterasi 1 (T1.1)"*).

### 1.2 Keputusan Implementasi (detail: `docs/decision-log.md` DL-19)

- Struktur monorepo sesuai DL-16: `backend/`, `frontend/`, `infra/`, `docs/`, `.github/workflows/`.
- Backend: Express 4.21 (stabilitas middleware), Zod untuk validasi env, pino untuk structured logging, pg + ioredis untuk health check dependensi (dipakai penuh di T1.2+).
- Frontend: React 18 + Vite 6 + Tailwind 3.4 + Vitest 3 (vitest 3 dipilih karena kompatibel dengan Vite 6; vitest 2 memicu konflik tipe).
- Health check desain: `GET /health` = liveness (selalu 200 jika proses hidup); `GET /health/ready` = readiness (DB/Redis; 503 jika dependensi yang dikonfigurasi `down`; `not_configured` dianggap siap). Misconfig production ditangkap fail-fast oleh validasi env (Zod superRefine: DATABASE_URL/REDIS_URL/JWT_SECRET wajib saat NODE_ENV=production).

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

## 3. Behavior Implemented

1. **Backend service** berjalan di port 3000 (default) dengan:
   - `GET /api/v1/health` → 200 liveness (status, uptime, timestamp).
   - `GET /api/v1/health/ready` → 200 bila DB/Redis tidak `down`; 503 bila dependensi yang dikonfigurasi `down`.
   - 404 `NOT_FOUND` + error handler terpusat `INTERNAL_ERROR` dengan `trace_id`.
   - Graceful shutdown (SIGTERM/SIGINT) menutup server, pool DB, dan koneksi Redis.
   - Validasi env Zod; fail-fast saat `NODE_ENV=production` tanpa `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET`.
2. **Frontend** SPA React + Tailwind menampilkan halaman fondasi; build produksi menghasilkan bundle statis (144 KB / 46 KB gzip).
3. **Infra**: compose dev & prod tervalidasi sintaks; stack dev berhasil `up` (lihat §5).
4. **CI**: workflow GitHub Actions dengan gate lint/format/typecheck/test/coverage/build/docker-build + job security scan + deploy-staging placeholder (diaktifkan T1.15). Belum berjalan di GitHub karena repo belum diinisialisasi (asumsi §1.1.2).

---

## 4. Tests Added / Modified

| File | Test | Hasil |
|------|------|-------|
| `backend/src/modules/health/health.test.ts` | liveness 200; readiness not_configured/up/down (kombinasi DB & Redis); unit checkDependencies (up/down/not_configured/parsial) | 10 pass |
| `backend/src/config/env.test.ts` | default test env; production tanpa dependensi → throw; production lengkap → ok | 3 pass |
| `backend/src/app.test.ts` | 404 endpoint tak dikenal; method tidak didukung; errorHandler 500 + trace_id (dengan & tanpa header) | 4 pass |
| `frontend/src/App.test.tsx` | render judul "Siak" | 1 pass |

**Total: 18 test pass (backend 17 + frontend 1).**

Coverage backend (Jest): statements 100% · branches 88.46% · functions 100% · lines 100% — **≥80% sesuai quality gate**.

---

## 5. Commands Executed & Actual Results

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

### 5.1 Kendala yang Ditemui & Diperbaiki

1. **Mount path health check salah** — router health di-mount di `/api/v1/health` dengan route `/health` → path menjadi `/api/v1/health/health` (404). Diperbaiki: mount di `/api/v1` (sesuai spec §5.2 `GET /health`). Ditutup dengan test.
2. **Coverage branch < 80%** — ditutup dengan test tambahan (env production fail-fast, error handler tanpa trace header, checkDependencies parsial).
3. **Konflik versi Vite** — vitest 2.x membawa vite sendiri yang bentrok dengan Vite 6 → upgrade ke Vitest 3 (kompatibel).
4. **ESLint `no-require-imports`** pada test env (jest.isolateModules) → rule dimatikan khusus file `*.test.ts`.

### 5.1 Kendala yang Ditemui & Diperbaiki

1. **Mount path health check salah** — router health di-mount di `/api/v1/health` dengan route `/health` → path menjadi `/api/v1/health/health` (404). Diperbaiki: mount di `/api/v1` (sesuai spec §5.2 `GET /health`). Ditutup dengan test.
2. **Coverage branch < 80%** — ditutup dengan test tambahan (env production fail-fast, error handler tanpa trace header, checkDependencies parsial).
3. **Konflik versi Vite** — vitest 2.x membawa vite sendiri yang bentrok dengan Vite 6 → upgrade ke Vitest 3 (kompatibel).
4. **ESLint `no-require-imports`** pada test env (jest.isolateModules) → rule dimatikan khusus file `*.test.ts`.
5. **Port konflik dengan container iterasi lama** — port 5432/6379 di host sudah dipakai container `siakad_*` (proyek lama). Diperbaiki: compose dev memakai host port 5433/6380 (konfigurasi via env `POSTGRES_PORT`/`REDIS_PORT`); internal network tetap 5432/6379.

---

## 6. Docker Compose Up — Hasil (DoD T1.1)

```text
$ docker compose -f infra/docker-compose.yml up -d --build
# Output: backend Built, frontend Built
# Containers: siak-postgres (healthy, 0.0.0.0:5433→5432), siak-redis (healthy, 0.0.0.0:6380→6379),
#             siak-backend (health: starting → healthy), siak-frontend (Up)

$ curl http://localhost:3000/api/v1/health
{"success":true,"data":{"status":"ok","service":"siak-backend","version":"0.1.0","uptimeSeconds":18,"timestamp":"2026-08-01T11:40:52.304Z"}}

$ curl http://localhost:3000/api/v1/health/ready
{"success":true,"data":{"status":"ready","dependencies":{"db":"up","redis":"up"}}}

$ curl -I http://localhost:8080
HTTP/1.1 200 OK
Server: nginx/1.27.5
Content-Type: text/html
```

**DoD T1.1 terpenuhi:**
- ✅ `docker compose up` jalan (image build + container start + healthcheck pass)
- ✅ Health check liveness `/health` → 200
- ✅ Health check readiness `/health/ready` → 200 (db:up, redis:up)
- ✅ Frontend via nginx di port 8080 → 200
- ✅ CI pipeline file `.github/workflows/ci.yml` tersedia (validasi lokal lulus lint/format/typecheck/test/build)

---

## 7. Known Limitations

1. **Modul bisnis masih stub** — auth, rbac, krs, academic, finance, dosen, audit, notification, import hanya router kosong; endpoint mengembalikan 404 sampai task terkait (T1.3 dst.) diimplementasikan. Ini disengaja (scope T1.1 = fondasi).
2. **CI belum tervalidasi di GitHub** — repo git belum diinisialisasi oleh pemilik (F-31); validasi dilakukan lokal dengan perintah yang sama.
3. **`deploy-staging` di CI berupa placeholder** — diaktifkan pada T1.15.
4. **Monitoring (Prometheus/Grafana/Loki) belum diuji end-to-end** — hanya file konfigurasi + validasi sintaks compose; diuji penuh saat T4.6.
5. **Coverage frontend belum diberlakukan ≥80%** — jumlah test frontend masih minim (1 test); threshold aktif saat T1.11 (banyak komponen).
6. **Psql/redis-cli tidak ada di host** — koneksi DB/Redis hanya lewat Docker (bukan kendala, hanya catatan environment).

## 8. Deviations

1. **Tidak ada deviasi dari spec docs/02 untuk cakupan T1.1.** Perbedaan kecil yang tercatat:
   - `GET /health/ready` tambahan (di luar spec yang hanya menyebut `GET /health`) — dipakai untuk readiness check container; `GET /health` tetap sesuai spec (liveness).
   - `JWT_SECRET` divalidasi wajib hanya saat `NODE_ENV=production` (fail-fast), bukan selalu — agar development lokal tanpa auth bisa jalan.
2. **Vitest 3** dipilih menggantikan "Jest (unit)" untuk frontend karena toolchain Vite (spec §11 menetapkan Jest untuk unit test secara umum; frontend memakai Vitest yang API-nya setara Jest, mengurangi toolchain ganda). Backend tetap Jest sesuai spec. *(Keputusan material → DL-19.)*

## 9. Security Considerations

- Tidak ada token/secret yang ditulis ke artefak (S-04): semua env memakai placeholder (`<ganti-dengan-...>`, `dev-only-...`).
- `.env`, `.env.*.local` masuk `.gitignore`; hanya `*.example` yang di-commit.
- Backend memakai `helmet` (header keamanan) dan `cors` dengan origin terbatas.
- `no-console` di-enforce; logging via pino (structured).
- Rate limit per IP sudah disiapkan di Nginx (login 5r/m, API 100r/m) — enforcement penuh di T1.3.
- Validasi input (Zod) sudah tersedia sebagai fondasi anti SQL injection (bersama Prisma/pg parameterized di T1.2+).

## 10. Remaining Risks

1. **APPROVE SPECIFICATION belum eksplisit** — jika pemilik belum menyetujui docs/02+docs/03, keputusan mulai implementasi perlu dikonfirmasi ulang; dampak terbatas karena T1.1 hanya fondasi (tidak ada logika bisnis).
2. **Repo git belum ada** — CI tidak aktif sampai pemilik menginisialisasi repo + remote; semua artefak ada di folder lokal.
3. **Docker Desktop harus menyala** untuk `docker compose up` (environment lokal).
4. **Build image belum diverifikasi penuh saat artefak ini ditulis** — hasil final di §6.

---

## 11. Handoff ke Reviewer

Independent review diperlukan sebelum release. Bukti untuk direproduksi:

```bash
# Backend
cd backend && npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test:coverage && npm run build
# Frontend
cd frontend && npm ci && npm run lint && npm run format:check && npm run typecheck && npm run test && npm run build
# Docker
docker compose -f infra/docker-compose.yml up -d --build
curl http://localhost:3000/health
curl http://localhost:3000/health/ready
curl http://localhost:8080   # frontend via nginx
```

**Catatan untuk Reviewer:** validasi CI penuh (GitHub Actions) baru bisa dijalankan setelah pemilik menginisialisasi repo + remote (F-31) dan push pertama.
