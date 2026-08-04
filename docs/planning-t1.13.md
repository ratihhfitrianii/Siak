# Rencana T1.13 — Virtual Waiting Room MVP (F-17, NF-05, K-09)

**Status**: T1.12 ✅ (`9a7c1d1`) · **T1.13 SELESAI** (backend `28d5e92`; frontend + docs menunggu commit) · T1.14 (load test) berikutnya
**Tanggal**: 2026-08-04 · **Referensi**: 03-execution-plan.md (T1.13), 02-solution-spec.md §7.1–7.2, docs/04-implementation-log.md §25

---

## 1. Fakta (state terverifikasi)

| Aspek | Kondisi |
|---|---|
| Kebutuhan | F-17 (antrean saat puncak), NF-05 (graceful degradation), K-09 (push + fallback polling) — docs/02 §7.1 |
| Ambang | Default 5.000 simultan (AC-01/NF-06), configurable via `WR_THRESHOLD` (DL-11) |
| Backend | `lib/redis.ts` (koneksi shared) + `modules/waiting-room/` (service, middleware, routes, socket) + wiring `app.ts`/`index.ts`/auth logout |
| Frontend | `lib/api.ts` interceptor 429 + `WaitingRoomPage` + route `/tunggu` + nginx `/socket.io/` |
| Redis dev | Container `siak-redis` up (healthy) — koneksi nyata tersedia di luar test |
| Test | Backend 15/15 × 3 run · Frontend 66/66, coverage ≥80 |

## 2. Keputusan

1. **Gate di middleware Express global** (bukan per-endpoint) — semua `/api/v1` dihitung sebagai user aktif; health + `/waiting-room/status` exempt (polling harus bisa jalan).
2. **Antrean = Redis ZSET** (score timestamp) + active set; sweeper 60s membersihkan token kadaluarsa (TTL 30m); `EventEmitter 'promoted'` → Socket.io `waiting:enter_now`.
3. **Redis down → allow semua** (bypass), konsisten dengan cache (NF-05).
4. **Token antrean di sessionStorage + redirect `/tunggu`** — halaman publik (tanpa JWT); masuk-ulang otomatis saat status `enter`.
5. **Push WebSocket lazy-load** (chunk 13 kB terpisah, main bundle tetap <200KB) + **fallback polling 15s** (K-09).
6. **Test tanpa Redis nyata** — fake Redis in-memory untuk service/middleware; Socket.io test pakai server+client nyata di port ephemeral; deterministik di CI.

## 3. Verifikasi (bukti positif)

```text
- Backend: npx jest --forceExit → 15/15 PASS × 3 run beruntun (sebelumnya baseline 9/12)
- Frontend: 66/66 PASS · coverage 95.72/82.75/83.69 · lint/typecheck/build OK
- Bundle main 85.60 kB gzip (<200KB NF-02) + chunk socket 13.12 kB
- audit prod: backend 0 vuln · frontend 0 vuln
```

## 4. Open Items

- **Integrasi end-to-end live** (browser nyata → 429 → halaman tunggu → masuk) belum diverifikasi manual di compose dev; load test T1.14 akan mengkalibrasi ambang.
- Token antrean belum punya JWT expiry — validasi ukuran antrean & abuse (flood 429) di T4.1 (waiting room production).
