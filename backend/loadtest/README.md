# Load Test — T1.14 (NF-06, AC-01)

Simulasi puncak hari pertama KRS dengan [k6](https://k6.io): 1k → 3k → 5k pengguna
simultan, flow KRS lengkap (login → periode → kelas tersedia → draft → submit).

## Prasyarat

1. Backend berjalan dengan build terbaru (mengandung waiting room + `trust proxy`):

   ```bash
   docker compose -f infra/docker-compose.yml up -d --build backend
   ```

2. Seed data load test (akun `lt-*` + kelas `LT-*` + `classes.json`):

   ```bash
   cd backend
   DATABASE_URL="postgres://siak:siak_dev_password@localhost:5433/siak" \
     npx tsx loadtest/seed.ts                 # default 5.500 user, 300 kelas/prodi
   ```

   Idempotent — hapus data `lt-%`/`LT-%` lama lalu insert ulang. Output
   `backend/loadtest/classes.json` dipakai k6 (pool classId per prodi).

3. Jalankan k6 (via Docker — tanpa install):

   ```bash
   # Mode kapasitas (default): p99 < 2s, error < 1%
   docker run --rm -i -v /c/Users/ratih/source/repos/Siak/backend/loadtest:/scripts \
     grafana/k6 run /scripts/scenario.js -e MODE=capacity -e BASE_URL=http://localhost:3000

   # Mode queue: buktikan waiting room E2E (butuh threshold kecil)
   WAITING_ROOM_THRESHOLD=50 docker compose -f infra/docker-compose.yml up -d backend
   docker run --rm -i -v /c/Users/ratih/source/repos/Siak/backend/loadtest:/scripts \
     grafana/k6 run /scripts/scenario.js -e MODE=queue -e BASE_URL=http://localhost:3000
   # → kembalikan threshold:
   docker compose -f infra/docker-compose.yml up -d backend
   ```

## Cleanup data load test

```bash
docker exec siak-postgres psql -U siak -d siak -c \
  "DELETE FROM users WHERE email LIKE 'lt-%@siak.local'; DELETE FROM classes WHERE class_code LIKE 'LT-%';"
```

## Catatan desain

- Semua VU mode kapasitas datang dari IP yang sama → waiting room tak terpicu
  (1 userKey) → angka = kapasitas backend murni.
- Mode queue memakai `X-Forwarded-For` unik per VU (didukung `trust proxy` T1.14)
  + `WAITING_ROOM_THRESHOLD` kecil → sebagian VU mendapat 429 `RATE_LIMITED`
  dengan token antrean; `/waiting-room/status` tetap respons (exempt gate).
- Login per-akun (bukan per-IP): 5.500 akun unik, password `Mhs123!` (dev).
- Hasil run terakhir dicatat di docs/04-implementation-log.md §26.
