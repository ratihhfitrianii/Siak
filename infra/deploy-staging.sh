#!/usr/bin/env bash
# Deploy Staging Script (T1.15) — Zero-downtime deploy to staging
# Usage: ./deploy-staging.sh [staging|production]

set -euo pipefail

ENV="${1:-staging}"
COMPOSE_FILE="infra/docker-compose.prod.yml"
ENV_FILE="infra/.env.prod"
DOMAIN="siak-staging.yourdomain.com"  # CHANGE THIS

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ $ENV_FILE tidak ditemukan. Copy dari .env.prod.example dan isi nilai nyata."
    exit 1
done

echo "🚀 Deploy $ENV ($DOMAIN)..."

# 1. Pull latest images (if using registry) atau build local
echo "📦 Building images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --no-cache

# 2. Run migrasi terpisah (service migrate) — sebelum backend up
echo "🔄 Running migrations..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up migrate

# 3. Deploy backend dengan rolling update (replicas=2, parallelism=1)
echo "🔧 Deploying backend (rolling)..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps backend

# Wait for healthcheck
echo "⏳ Waiting for backend health..."
for i in {1..30}; do
    if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps backend | grep -q "healthy"; then
        echo "✅ Backend healthy"
        break
    fi
    sleep 2
done

# 4. Deploy frontend
echo "🎨 Deploying frontend..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --no-deps frontend

# 5. Reload nginx (zero-downtime)
echo "🔀 Reloading nginx..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec nginx nginx -s reload

# 6. Smoke test
echo "🧪 Smoke test..."
sleep 3
if curl -sf "https://$DOMAIN/api/v1/health" > /dev/null; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    exit 1
fi

echo "🎉 Deploy $ENV selesai! Access: https://$DOMAIN"