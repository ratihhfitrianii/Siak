# Deployment — Free Tier PaaS (Vercel + Render + Neon + Upstash)

> **Tanggal:** 2026-08-10
> **Status:** Konfigurasi disiapkan (`frontend/vercel.json` + runbook ini) — eksekusi deploy manual oleh pemilik.
> **Biaya:** Rp 0 (semua layanan di free tier).
> **Alternatif self-host:** `docs/deployment-staging.md` (Docker Compose + Nginx, butuh VPS).

## Arsitektur

```
Browser
  │  HTTPS (hanya bicara ke Vercel — same-origin, tanpa CORS)
  ▼
┌──────────────┐   rewrite /api/*    ┌──────────────────┐
│  Vercel      │ ──────────────────► │  Render           │
│  (FE SPA)    │                     │  (BE Node, :3000) │
└──────────────┘                     └───────┬──────┬────┘
     ▲                                      │      │
     └─ static dist/ (93.6 kB gzip)         ▼      ▼
                                   Neon      Upstash
                                   (Postgres) (Redis)
```

- **Vercel (Hobby/free)** — host SPA statis; `vercel.json` me-rewrite `/api/*` ke Render + fallback SPA ke `index.html`. Browser hanya melihat domain Vercel → **CORS tidak bermasalah**.
- **Render (free web service)** — backend butuh **proses persisten** (Socket.io HTTP server, 3 scheduler `setInterval`, pg pool, PDFKit) → serverless Vercel tidak cocok.
- **Neon (free)** — Postgres 0.5 GB, URL langsung (`sslmode=require`), auto-suspend.
- **Upstash (free)** — Redis 256 MB / 5.000 command per hari; kompatibel ioredis.

## Prasyarat

- Akun gratis: vercel.com, render.com, neon.tech, upstash.com.
- Repo ter-push: `origin/main` sudah `c7f07e0` (CI hijau).

---

## Step 1 — Neon (Postgres)

1. Sign up → **New Project** (region dekat, mis. Singapore).
2. Copy **connection string** versi *pooled* (berisi `-pooler` dan `sslmode=require`).
3. Simpan sebagai `DATABASE_URL` (jangan pernah di-commit).

## Step 2 — Upstash (Redis)

1. **Create database** (region Singapore) → buat.
2. Copy `REDIS_URL` (format `rediss://default:...@...upstash.io`).

## Step 3 — Migrasi (sekali, dari lokal)

```bash
cd backend
DATABASE_URL="<neon-url>" npx node-pg-migrate up
```

- Tanpa config file → node-pg-migrate membaca env `DATABASE_URL`; direktori default `./migrations` (18 file UP).
- ⚠️ Pakai URL Neon dengan `sslmode=verify-full` (bukan `require`) — `pg` 8.13+ meng-alias `require` ke `verify-full` dan mengeluarkan `SECURITY WARNING: ... aliases for verify-full`; ganti param query URL supaya bersih (perilaku koneksi identik).
- Verifikasi di Neon console: tabel `pgmigrations` berisi **18 baris**, tabel `prodis` ada.
- ⚠️ Migrasi ikut men-seed (dari V004/V005): admin `admin@siak.local` (password default `Admin123!`) + data dev ~2000 mahasiswa / ~100 dosen. Setelah deploy pertama **langsung ganti password admin** (lihat Keamanan).

## Step 4 — Render (Backend)

1. Dashboard → **New** → **Web Service** → connect repo GitHub `Siak`.
2. Pengaturan:
   | Field | Nilai |
   |---|---|
   | Root Directory | `backend` |
   | Build Command | `npm ci --include dev && npm run build` |
   | Start Command | `npm start` |
   | NODE_VERSION | `22` |
   | Health Check Path | `/api/v1/health` |

   > ⚠️ **Pitfall `TS2688: Cannot find type definition file for 'jest'`**: env var `NODE_ENV=production` membuat `npm ci` **me-skip devDependencies** → `@types/jest` (devDep) tidak ter-install → `tsc` gagal. (Type `node` tetap ada karena transitif dari prod-dep `@types/multer`, jadi error muncul khusus `jest`.) Solusi: tambahkan `--include dev` di Build Command seperti di atas — memaksa devDeps ter-install untuk build, tanpa memengaruhi runtime (Start Command `npm start` tetap pakai prod-dep saja). Terverifikasi lokal (npm 10.9.2, probe install + `npm run build` exit 0).
   > ⚠️ **Pitfall `ENOENT dist/modules/waiting-room/waiting-room.lua`**: `tsc` tidak menyalin file non-TS. `waiting-room.service.ts` membaca `waiting-room.lua` via `__dirname` saat startup, jadi file wajib ada di `dist/`. Sejak commit fix, script `npm run build` sudah otomatis menyalinnya (`tsc ... && node -e "...copyFileSync..."`), jadi **tidak perlu ubah apa pun di Render** — cukup redeploy setelah commit ter-push.
3. Environment variables (isi di dashboard — **bukan** di repo):
   | Variable | Nilai |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | dari Neon (Step 1) — **ubah `sslmode=require` → `sslmode=verify-full`** di param query URL agar tidak muncul warning `SECURITY WARNING: ... aliases for verify-full` dari `pg` 8.13+ (perilaku koneksi identik; `require` sudah diperlakukan sebagai `verify-full`) |
   | `REDIS_URL` | dari Upstash (Step 2) |
   | `JWT_SECRET` | hasil `openssl rand -base64 48` |
   | `CORS_ORIGIN` | `https://<app>.vercel.app` (isi setelah Step 5) |
   | `DATABASE_POOL_MAX` | `5` (pool kecil untuk Neon free) |
   | `PORT` | Render mengisi otomatis |
4. Deploy → cek log: `listening on http://localhost:<PORT> (production)`.
   > ⚠️ **Pitfall `PostgreSQL pool connection failed` / `Connection terminated unexpectedly`** (saat cold start): Render free men-suspend instance setelah ~15 menit idle; saat bangun, Neon free mungkin masih auto-suspend → test `SELECT 1` startup gagal (log level 50) → **self-healing** (app tetap jalan, Neon resume 2-5 dtk, query berikutnya sukses). Sejak commit fix `src/lib/pg.ts`: test startup retry 3× (log warn saja), idle client error tidak lagi `process.exit(-1)` (dulu berisiko crash saat Neon menutup koneksi idle), `connectionTimeoutMillis` 10 dtk. Tidak ada tindakan yang diperlukan — kalau muncul di log, itu sinyal cold start, bukan crash.
5. ⚠️ `backend/src/config/env.ts` (superRefine): di `production`, `DATABASE_URL`, `REDIS_URL`, dan `JWT_SECRET` **wajib** — kalau kurang satu saja, backend langsung crash saat start (by design, K-01).

## Step 5 — Vercel (Frontend)

1. **Import Repository** → pilih repo `Siak`.
2. Pengaturan:
   | Field | Nilai |
   |---|---|
   | Root Directory | `frontend` |
   | Framework Preset | Vite |
   | Build Command | `npm ci && npm run build` |
   | Output Directory | `dist` |
3. `frontend/vercel.json` sudah tersedia di repo: rewrite `/api/:path*` → Render + fallback SPA.
   **⚠️ Ganti placeholder `https://siak-backend.onrender.com` dengan URL Render asli** (Step 4) — commit & push → Vercel redeploy otomatis.
4. Deploy → dapat URL `https://<app>.vercel.app`.

## Step 6 — Verifikasi

1. Buka `https://<app>.vercel.app` → login `admin@siak.local` / `Admin123!` → **ganti password segera**.
2. Uji alur: buat user mahasiswa & dosen → login pakai NIM/NIK → KRS, Pembayaran, Transkrip + PDF.
3. Backend langsung: `https://<render-app>.onrender.com/api/v1/health` → `200`.
4. Waiting room: upgrade WebSocket **tidak diteruskan proxy Vercel** → socket.io otomatis fallback ke HTTP polling (sudah di-handle di `frontend/src/pages/WaitingRoomPage.tsx` — `connect_error` → polling tetap jalan). Fungsional, realtime-nya jadi polling.

---

## Caveat Free Tier (jujur)

| Layanan | Batas | Implikasi |
|---|---|---|
| Render free | idle-suspend 15 menit | Request pertama setelah idle lambat (cold start ~30–60 dtk) |
| Neon free | 0.5 GB, compute auto-suspend | DB ikut cold start saat tidak dipakai |
| Upstash free | 256 MB, 5.000 command/hari | Cukup untuk UAT/demo; rate-limit login & waiting room memakai Redis |
| Vercel free | 100 GB bandwidth/bulan | Lebih dari cukup |

## Keamanan (checklist wajib)

- [ ] Ganti password admin default `Admin123!` setelah login pertama (via UI/`POST /auth/change-password`).
- [ ] `JWT_SECRET` kuat (≥32 char), hanya di env Render — jangan di repo.
- [ ] Opsional — nonaktifkan data dev seed supaya DB produksi bersih:
  ```sql
  UPDATE users SET is_active = false
  WHERE email <> 'admin@siak.local'
    AND email NOT IN (SELECT email FROM users WHERE email LIKE 'e2e.%');
  ```
  (Cek dulu daftar email hasil `SELECT email FROM users` di Neon console.)
- [ ] `.env` lokal tidak pernah di-commit; `backend/database.json` hanya untuk dev lokal (produksi memakai `DATABASE_URL`).

## Catatan

- Scheduler internal (reminder KRS, delivery notifikasi, sweeper waiting-room) berjalan normal di Render karena proses persisten — beda dengan serverless.
- Kalau realtime WebSocket penuh diinginkan tanpa proxy Vercel: arahkan `API_BASE` frontend langsung ke Render (butuh `VITE_API_URL` + CORS) — tidak direkomendasikan untuk sekarang.
- Railway & Fly.io **tidak** direkomendasikan: tidak ada free tier untuk akun baru (per 2026).
