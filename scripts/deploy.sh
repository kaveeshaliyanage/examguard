#!/usr/bin/env bash
# Pull published images and restart the production stack. Run from the repository root on the VPS.
set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "usage: scripts/deploy.sh <image-tag>   e.g. v1.2.0" >&2
  exit 2
fi

if [ ! -f .env ]; then
  echo ".env is missing. Copy deploy/.env.production.example to .env and fill it in." >&2
  exit 2
fi

export EXAMGUARD_VERSION="$VERSION"

docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
docker compose -f docker-compose.prod.yml ps

echo
echo "Waiting for the stack to become healthy..."
for _ in $(seq 1 60); do
  unhealthy=$(docker compose -f docker-compose.prod.yml ps --format json 2>/dev/null \
    | grep -c '"Health":"starting"' || true)
  if [ "$unhealthy" = "0" ]; then
    break
  fi
  sleep 5
done

docker compose -f docker-compose.prod.yml ps
curl -fsS "http://localhost:${HTTP_PORT:-80}/api/health"
echo
echo "ExamGuard $VERSION is live."
