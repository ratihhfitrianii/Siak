# T1.15 — Deployment Staging Documentation

## Overview
Deploy staging environment dengan Docker Compose production-ready, Nginx SSL termination, zero-downtime rolling updates.

## Files Created
- `infra/docker-compose.prod.yml` — Production compose (2x backend replicas, resource limits, healthchecks)
- `infra/nginx.prod.conf` — Nginx SSL + rate limiting + WebSocket proxy
- `infra/.env.prod.example` — Environment template
- `infra/deploy-staging.sh` — Zero-downtime deploy script

## Architecture
```
Internet (HTTPS 443)
    │
    ▼
┌─────────────────────┐
│      Nginx          │ ← SSL termination, rate limiting, SPA proxy
│  (nginx:alpine)     │
└──────────┬──────────┘
           │
    ┌──────┴──────┐
    ▼             ▼
┌─────────┐  ┌──────────┐
│ Backend │  │ Frontend │
│  x2     │  │ (nginx)  │
└────┬────┘  └──────────┘
     │
┌────┴────┐
│ PostgreSQL │ ← max_connections=500
│  (16)     │
└────┬────┘
     │
┌────┴────┐
│  Redis   │ ← maxmemory 256MB LRU
│  (7)     │
└─────────┘
```

## Rate Limiting (nginx.prod.conf)
| Zone | Rate | Burst | Applied To |
|------|------|-------|------------|
| `api_limit` | 100 r/s | 200 | All `/api/` |
| `login_limit` | 5 r/m | 5 | `/api/v1/auth/login` |
| `waiting_room_limit` | 50 r/s | 100 | `/api/v1/waiting-room/` |

## Zero-Downtime Deploy
```bash
# 1. Build
docker compose -f infra/docker-compose.prod.yml --env-file .env.prod build --no-cache

# 2. Migrasi terpisah (service migrate runs before backend)
docker compose -f infra/docker-compose.prod.yml --env-file .env.prod up migrate

# 3. Rolling update backend (replicas=2, parallelism=1)
docker compose -f infra/docker-compose.prod.yml --env-file .env.prod up -d --no-deps backend

# 4. Frontend
docker compose -f infra/docker-compose.prod.yml --env-file .env.prod up -d --no-deps frontend

# 5. Nginx reload
docker compose -f infra/docker-compose.prod.yml --env-file .env.prod exec nginx nginx -s reload
```

Or use script: `./infra/deploy-staging.sh staging`

## SSL Certificates
Let's Encrypt (staging/production):
```bash
certbot certonly --standalone -d siak.yourdomain.com
# Copy fullchain.pem + privkey.pem to ./certs/ (mounted as nginx-certs volume)
```

## Environment Variables (from .env.prod)
| Variable | Staging | Production | Description |
|----------|---------|------------|-------------|
| `DATABASE_POOL_MAX` | 100-200 | 200-300 | PG pool size (DL-28) |
| `WAITING_ROOM_THRESHOLD` | 1500 | 2000 | Kalibrasi dari load test (DL-11; keluhan #4) |
| `JWT_SECRET` | ≥32 chars | ≥32 chars | Rotate periodically |
| `POSTGRES_PASSWORD` | strong | very strong | |
| `CORS_ORIGIN` | https://staging... | https://prod... | |

## Health Checks
- **Backend**: `GET /api/v1/health` (interval 10s)
- **PostgreSQL**: `pg_isready`
- **Redis**: `redis-cli ping`
- **Nginx**: `nginx -t`

## Resource Limits (docker-compose.prod.yml)
| Service | CPU Limit | Memory Limit | Replicas |
|---------|-----------|--------------|----------|
| postgres | 2.0 | 2G | 1 |
| redis | 0.5 | 512M | 1 |
| backend | 1.0 | 1G | 2 |
| nginx | - | - | 1 |

## Next Steps After Staging Deploy
1. Verify all T1.1-T1.14 features work on HTTPS
2. Run k6 load test against staging (`BASE_URL=https://staging...`)
3. Calibrate `WAITING_ROOM_THRESHOLD` & `DATABASE_POOL_MAX` for production VPS
4. T2.1+ (Payment, Transkrip, Dosen) continue development