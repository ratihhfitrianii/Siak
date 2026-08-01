# Siak — Sistem Informasi Akademik

Platform digital administrasi akademik mahasiswa (profil, nilai/IPK, KRS, pembayaran) untuk kampus nyata
(±2.000 mahasiswa, ±100 dosen; puncak ±5.000 simultan saat hari pertama KRS).

> Status pengembangan: **Iterasi 1 (MVP Core) dimulai — T1.1 (fondasi repo) selesai**.
> Lihat `docs/04-implementation-log.md` dan `docs/project-status.md`.

## Struktur Monorepo (DL-16)

```
backend/    Node.js 22 + TypeScript + Express (monolith modular)
frontend/   React 18 + Vite + Tailwind CSS (SPA)
infra/      Docker Compose, Nginx, PgBouncer, Prometheus, Grafana, Loki
docs/       Artefak proyek (brief, requirements, spec, execution plan, log, status)
migrations/ (di dalam backend/migrations — node-pg-migrate, SQL up/down)
```

## Prasyarat

- Node.js 22+
- Docker Desktop (untuk PostgreSQL 16 + Redis 7 + build image)
- npm 10+

## Menjalankan (Development)

```bash
# 1. Salin env (nilai default untuk dev; jangan commit .env)
cp .env.example .env

# 2. Infra (PostgreSQL + Redis) via Docker — host ports default 5433/6380
docker compose -f infra/docker-compose.yml up -d postgres redis

# 3. Backend (http://localhost:3000)
cd backend
npm install
npm run dev

# 4. Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

Health check: `GET http://localhost:3000/health` (liveness) dan `GET http://localhost:3000/health/ready` (readiness: DB + Redis).

## Quality Gates (docs/03 §8 — wajib sebelum merge)

| Gate | Perintah | Threshold |
|------|----------|-----------|
| Lint | `npm run lint` (backend & frontend) | 0 error, 0 warning |
| Format | `npm run format:check` | Prettier konsisten |
| Type Check | `npm run typecheck` | 0 error |
| Unit Test | `npm run test:coverage` | Coverage ≥ 80% |
| Build | `npm run build` | Sukses |
| Docker | `docker compose build` | Sukses |

## Deployment

- Staging/Production: `infra/docker-compose.prod.yml` (Nginx + backend + PgBouncer + PostgreSQL + Redis + Prometheus/Grafana/Loki).
- Migrasi DB terpisah dari kode: `npm run migrate:up` (service `migrate` di compose prod, dijalankan sebelum backend start).
- Env var: lihat `infra/.env.production.example` — **jangan commit secret nyata** (S-04).

## Dokumentasi Proyek

- `docs/00-project-brief.md` — brief & confirmed facts
- `docs/01-requirements.md` — requirements (APPROVED)
- `docs/02-solution-spec.md` — solution spec (DRAFT — menunggu APPROVE SPECIFICATION)
- `docs/03-execution-plan.md` — execution plan (DRAFT — menunggu APPROVE SPECIFICATION)
- `docs/decision-log.md` — keputusan desain
- `docs/04-implementation-log.md` — log implementasi (dikelola Developer)
- `docs/project-status.md` — status proyek
