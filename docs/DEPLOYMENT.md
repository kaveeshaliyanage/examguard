# Deployment

Two paths exist. Local development uses `docker-compose.yml` and builds from source. Production
uses `docker-compose.prod.yml` and pulls immutable images from GHCR.

## Branches

| Branch | Purpose |
| --- | --- |
| `main` | Released history. Only receives `--no-ff` merges from `develop`; tags are cut here. |
| `develop` | Integration branch; CI runs on every push. |
| `feature/*` | Short-lived work, merged into `develop` with `--no-ff` and deleted after release. |

## Release flow

1. Merge to `main` (CI must be green, including the compose smoke job).
2. Tag the release:
   ```bash
   git checkout main && git pull
   git tag -a v1.0.0 -m "ExamGuard 1.0.0"
   git push origin v1.0.0
   ```
3. The **CD** workflow publishes
   `ghcr.io/<owner>/examguard-{backend,ai,frontend}:v1.0.0` (plus `1.0`, `1.0.0`, `latest`
   and a short SHA tag) and creates a GitHub release with the unpacked extension zip.
4. Deploy:
   ```bash
   ssh deploy@examguard-host
   cd /opt/examguard
   ./scripts/deploy.sh v1.0.0
   ```

Set `DEPLOY_ENABLED=true` as a repository variable to let the CD workflow deploy automatically on
every tag. Without it, deployment is manual or triggered through `workflow_dispatch` with the
`deploy` input enabled.

## VPS prerequisites

- Docker Engine 24+ with the compose plugin.
- A non-root deploy user in the `docker` group; the app directory owned by that user.
- The repository cloned at `/opt/examguard` (or set `VPS_APP_DIR` to the real path).
- `.env` copied from `deploy/.env.production.example` and filled in. Keep it `chmod 600`.
- A GHCR login for the deploy user. The repository is private, so its packages are private too:
  ```bash
  printf '%s' "$GHCR_PAT" | docker login ghcr.io -u <github-user> --password-stdin
  ```
  Use a token with `read:packages`. `scripts/deploy.sh` pulls as that user.
- TLS terminated in front of port 80 (Caddy, nginx, or the cloud load balancer). The frontend
  container only speaks HTTP.

GitHub secrets for the optional deploy job:

| Secret | Purpose |
| --- | --- |
| `VPS_HOST` | Hostname or IP |
| `VPS_USER` | SSH user |
| `VPS_SSH_KEY` | Private key with access to the app directory |

| Variable | Purpose |
| --- | --- |
| `VPS_APP_DIR` | Repository path on the server, e.g. `/opt/examguard` |
| `DEPLOY_ENABLED` | `true` to deploy automatically on every version tag |

## What is published

Only the frontend port. MySQL, the AI service and the backend are on the compose network.
`frontend/nginx.conf` proxies `/api/` to `backend:8080`, so the browser never talks to the backend
directly and CORS stays closed by default.

## Rollback

Images are immutable per tag:

```bash
./scripts/deploy.sh v0.9.0
```

The database volume is not rolled back. Flyway migrations are forward-only, so keep a backup
before deploying a release that adds a migration.

## Models in production

`ai/models` is mounted read-only. With `USE_LEARNED_FUSION=false` the rule weights are used and no
artifacts are required. To enable learned fusion:

1. Train (see [`docs/TRAINING.md`](TRAINING.md) or [`kaggle/README.md`](../kaggle/README.md)).
2. Copy `pair_fusion.joblib`, `incident_fusion.joblib`, the `*.meta.json` files and `MODEL_CARD.md`
   into `ai/models/`.
3. Set `USE_LEARNED_FUSION=true` and restart the `ai` service.
4. Keep the model card with the release notes; it records that the metrics are synthetic.

Deploying without the artifacts while `USE_LEARNED_FUSION=true` falls back to rules
(`_load_model` returns `None`), which is safe but easy to miss. Check the `fusionMode` stat in an
analysis response after switching.

## Backup

```bash
docker compose -f docker-compose.prod.yml exec mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction examguard > examguard-$(date +%F).sql
```
