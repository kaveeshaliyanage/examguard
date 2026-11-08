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

The authorship classifier uses the same switch: `USE_LEARNED_FUSION=true` plus
`models/authorship.joblib` and `authorship.meta.json` loads the calibrated estimator; otherwise the
transparent rule weights score stylometry. Either path caps the score at 54, so deployment cannot
change the MEDIUM band ceiling. `/health` reports `authorshipAvailable` and `authorshipScoreCap`.

## Cloud deployment: Render + Supabase + Vercel

The managed path runs the same two containers as the VPS path:

```
Vercel (SPA) --HTTPS--> Render examguard-api --HTTPS--> Render examguard-ai
                              |
                              +--> Supabase PostgreSQL 16
```

Only the API and the AI service are public. The SPA never talks to the AI service directly.

### 1. Supabase (PostgreSQL 16)

1. Create a project. Settings > Database shows two connection strings.
2. Use the **direct** connection (`db.<ref>.supabase.co:5432`) for the API. A single long-lived
   Render instance holds few connections, and Flyway needs a session-capable connection on the
   first boot. Use the transaction pooler (`<region>.pooler.supabase.com:6543`,
   `?prepareThreshold=0`) only if you scale to several API instances.
3. Give the API a dedicated role rather than `postgres`; it needs DDL rights on the first deploy
   because Flyway creates the schema.

```
DB_VENDOR=postgresql
SPRING_DATASOURCE_URL=jdbc:postgresql://db.<ref>.supabase.co:5432/postgres?sslmode=require
SPRING_DATASOURCE_USERNAME=examguard
SPRING_DATASOURCE_PASSWORD=<password>
```

Flyway picks `classpath:db/migration/postgresql` from `DB_VENDOR` and validates the result against
the entity mappings (`ddl-auto: validate`). A mismatch fails startup rather than drifting silently.

### 2. Render

`render.yaml` at the repository root declares both services. Create a Blueprint and point it at the
repository, then fill the secrets marked `sync: false` in the dashboard.

| Service | Health check | Notes |
| --- | --- | --- |
| `examguard-api` | `/actuator/health` | Java image, `SEED_DEMO_DATA=false`, generated `JWT_SECRET` |
| `examguard-ai` | `/health` | Python image, models not shipped by default |

Set `ANALYSIS_BASE_URL` to the AI service's public URL and `CORS_ALLOWED_ORIGINS` to the Vercel
production domain. Do not use a wildcard: the SPA is the only browser client.

Starter and free instances spin down when idle; the first request afterwards takes 30–60 seconds.
Add an uptime ping on `/health` if the AI service must stay warm during an exam window, or move to a
paid plan for exam days.

Learned fusion stays off (`USE_LEARNED_FUSION=false`) until the artifacts are copied into `ai/models`.
The deployment then uses rule weights and the response reports the rule fusion mode.

### 3. Vercel

Import the repository, set the root directory to `frontend`, and keep the Vite preset. `vercel.json`
rewrites every path to `index.html` so client-side routes survive a refresh.

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://examguard-api.onrender.com` |
| `VITE_DEFAULT_EXAM_CODE` | optional, join-page default |

The browser calls the API cross-origin in this topology, so the API's `CORS_ALLOWED_ORIGINS` must
contain the exact Vercel origin (preview deployments included, if you use them).

### 4. Cloud smoke test

```bash
curl -fsS https://examguard-api.onrender.com/actuator/health
curl -fsS https://examguard-ai.onrender.com/health
curl -fsS https://<app>.vercel.app/ > /dev/null
# then sign in through the browser and confirm /api/exams returns for a lecturer
```

## Backup

```bash
docker compose -f docker-compose.prod.yml exec mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction examguard > examguard-$(date +%F).sql
```
