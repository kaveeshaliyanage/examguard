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
docker compose -f docker-compose.prod.yml up -d --remove-orphans --wait --wait-timeout 240

HTTP_PORT="$(sed -n 's/^HTTP_PORT=//p' .env | tail -n1)"
curl -fsS "http://127.0.0.1:${HTTP_PORT:-80}/api/health"
echo
echo "ExamGuard $VERSION is live."
