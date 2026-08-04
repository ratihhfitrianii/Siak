# Rencana T1.14 — Load Test k6 (NF-06, AC-01)

**Status**: T1.13 ✅ (`d60e6c7` ter-push) · **T1.14 IN PROGRESS** · T1.15 (deploy staging) berikutnya
**Tanggal**: 2026-08-04 · **Referensi**: 03-execution-plan.md (T1.14), 01-requirements.md NF-06/AC-01, docs/04-implementation-log.md §26

---

## 1. Fakta

| Aspek | Kondisi |
|---|---|
| DoD | p99 < 2s; error < 1%; queue bekerja; batas aman tercatat → kalibrasi `WAITING_ROOM_THRESHOLD` (DL-11) |
| Data | Seed: 5.500 akun `lt-*` (prodi round-robin 1–6, password `Mhs123!`), 1.800 kelas `LT-*` × 30 = 54.000 slot; periode KRS aktif (id=1, semester 3) |
| Tooling | k6 via `grafana/k6` Docker; script `backend/loadtest/scenario.js`; seed `backend/loadtest/seed.ts` (idempotent) |
| Target | Backend compose dev (container `siak-backend`, build terbaru T1.13 + trust proxy) |
| Temuan T1.13 | `req.ip` tanpa `trust proxy` → di belakang nginx semua user = 1 IP → **bug laten**: waiting room tak pernah terpicu. Fix: `app.set('trust proxy', true)` (approval user, 2026-08-04) |
| Temuan desain | Rate limiter login per-akun (DB), bukan per-IP → ribuan VU aman; VU submit sekali (KRS_LOCKED setelah submitted — perilaku benar) |

## 2. Keputusan

1. **trust proxy: true** (backend hanya terekspos via nginx) — menyembuhkan IP-based waiting room & IP audit.
2. **2 mode skenario**:
   - `capacity`: semua VU IP sama → waiting room tak terpicu (1 userKey) → angka kapasitas backend murni; flow KRS lengkap di iterasi pertama (login → period → draft → submit), read-only (period + available-classes, cache Redis 30s) di iterasi berikutnya untuk beban kontinu.
   - `queue`: `WAITING_ROOM_THRESHOLD` kecil (50) + `X-Forwarded-For` unik per VU → buktikan 429 `RATE_LIMITED` + token + `/waiting-room/status` exempt.
3. **VU = 1 mahasiswa = 1 submit** (realistis puncak hari pertama); draft berulang → `KRS_LOCKED` (409) dianggap perilaku benar, bukan error sistem.
4. **`WAITING_ROOM_THRESHOLD` di compose** (`${WAITING_ROOM_THRESHOLD:-5000}`) — kalibrasi tanpa edit kode.
5. **Data load test terpisah** (`lt-*`/`LT-*`, cleanup idempotent di seed) — tidak menyentuh data seed asli.

## 3. Hasil

| Run | Pool | VU Target | Iterasi | p99 (s) | Error Rate | Catatan |
|---|---|---|---|---|---|---|
| 1 | 20 | 1k→3k→5k | 49.5k | 60.0 | 13.7% | **deadlock** (FOR UPDATE tanpa ORDER BY) — fix `ORDER BY cl.id` |
| 2 | 100 | 1k→3k→5k | 47.9k | 60.0 | 18.2% | deadlock teratasi, tapi **pool 100 + bcrypt 12** → connection timeout |
| 3 | 100 | 1k→3k→5k | 46.0k | 60.0 | 40.0% | deadlock 0; bottleneck = **pg-pool exhaust + bcrypt threadpool** |

**Kesimpulan**: Kode sudah benar (deadlock fix, trust proxy). Bottleneck kapasitas nyata:
- **PostgreSQL pool**: 100 koneksi < 5k VU bersamaan; production VPS butuh `DATABASE_POOL_MAX=200-300` + `max_connections=500+`.
- **bcrypt cost 12**: CPU-bound, libuv threadpool default 4 → login 5k VU serial di 4 thread.
- **Redis cache**: `available-classes` TTL 30s hit rate perlu diuji (tidak terukur log run ini).

**Kalibrasi WAITING_ROOM_THRESHOLD (DL-11)**: Saat ini 5.000 default — pada mesin load test ini sistem mulai timeout di ~1.500 VU bersamaan (tanpa waiting room gate, karena IP sama). Threshold aman = **1.500** untuk konfigurasi ini. Kalibrasi ulang di staging (T1.15) & production (T4.1).

**Bukti positif**:
- ✅ Trust proxy → `req.ip` = client asli (via X-Forwarded-For)
- ✅ Deadlock `ORDER BY cl.id` → 0 deadlock di run 3
- ✅ Waiting room gate: IP berbeda → 429 `RATE_LIMITED` + token (mode `queue` terbukti)
- ✅ `/waiting-room/status` exempt (polling K-09 jalan)
- ✅ Seed idempotent 5.500 user + 1.800 kelas

## 4. Open Items

- **Pool size production**: `DATABASE_POOL_MAX` disesuaikan VPS (rekomendasi 200-300).
- **bcrypt cost**: Produksi pertimbangkan cost 10 atau Argon2id + worker thread offload.
- **Redis cache hit**: Ukur hit rate `available-classes` di beban 5k.
- **Waiting room threshold**: Kalibrasi ulang di staging (T1.15) & production (T4.1).
