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
3. The **CD** workflow first waits (up to 25 minutes) for every CI job to succeed on the tagged
   commit, then publishes
   `ghcr.io/<owner>/examguard-{backend,ai,frontend,runner}:v1.0.0` (plus `1.0`, `1.0.0` and a
   short SHA tag) and creates a GitHub release with the unpacked extension zip. The `latest` tag is
   only moved by a full release; a prerelease such as `v1.1.0-rc1` publishes only its version tags.
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

## Code runner

The `runner` service executes submitted code and is never exposed: it joins `runner_net` (marked
`internal: true`, so the container has no egress) and publishes no host port. The backend is the only
client, at `http://runner:8000`.

Both the `runner` and `backend` containers must receive the same `RUNNER_TOKEN`. Compose refuses to
start when it is unset `${RUNNER_TOKEN:?…}`. The runner fails closed:

| Condition | Response |
| --- | --- |
| `RUNNER_TOKEN` unset inside the runner | `503` on every `/run` |
| Header missing or wrong | `401` |
| Every execution slot busy | `429` with `Retry-After: 5` |
| Authorized run | result, capped at 75 s wall time |

Without a reachable runner, submit still succeeds and coding answers stay ungraded; they are never
scored as zero. Start the runner and use **Re-run code judging**, or let the backend do it on the
next submit. The runner's isolation is process-level (non-root, read-only rootfs, rlimits, no
egress); it is not a proven security boundary for hostile code. Keep it internal-only.

## Exam PIN email

PIN emails are opt-in and never block an exam: when delivery fails, the lecturer still receives the
PIN once in the **Access PIN** card and the affected roster addresses are listed as
`failedRecipients`.

**Local compose** starts Mailpit next to the stack. The backend gets `MAIL_ENABLED=true`,
`MAIL_HOST=mailpit`, `MAIL_PORT=1025` by default, so issuing a PIN sends it to the catcher:

- SMTP: `localhost:1025`
- Web inbox: <http://localhost:8025>

No mail leaves the machine.

**Production** uses your SMTP relay. Set in `.env`:

```
MAIL_ENABLED=true
MAIL_HOST=smtp.your-provider.example
MAIL_PORT=587
MAIL_USERNAME=<user>
MAIL_PASSWORD=<password>
MAIL_SMTP_AUTH=true
MAIL_STARTTLS=true
MAIL_FROM=exams@your-domain.example
```

`docker-compose.prod.yml` defaults `MAIL_ENABLED=false` so a deployment without a relay never
attempts delivery. Cloud (Render) sets the same variables as secrets in the dashboard.

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

```
Browser ──HTTPS──> Vercel (static SPA)
   │
   └──HTTPS──> Render examguard-api (Spring Boot) ──HTTPS + X-Analysis-Token──> Render examguard-ai
                       │
                       └──TLS──> Supabase PostgreSQL (session pooler, schema "examguard")
```

The browser calls the API directly (cross-origin), so CORS on the API names the Vercel origin.
The analysis service is public because Render's free plan has no private services; it rejects
any analysis call without the shared `ANALYSIS_TOKEN`. Deploy in the order below: each step needs
a value from the one before it.

### What the free plan means

| Limit | Effect | Mitigation |
| --- | --- | --- |
| Render free instances sleep after 15 idle minutes | First request takes 30–60 s; nothing runs while asleep | Open the site a few minutes before an exam. Students' heartbeats keep it awake during the exam |
| Deadline job sleeps with the API | An attempt that expires while asleep is auto-submitted a few seconds after wake-up | `submittedAt` is stamped with the deadline itself, and saves past the deadline are always rejected |
| No code runner | Coding answers stay **ungraded** (never scored zero) | Add a paid private service for the runner later |
| 512 MB RAM per instance | JVM limited via `JAVA_TOOL_OPTIONS` in `render.yaml` | Move to Starter if the API restarts under load (Render shows "Out of memory" in events) |
| Render free: 750 instance-hours per workspace per month | Two always-awake services would exceed it | Sleeping instances do not use hours; do not add an uptime pinger to both |
| Supabase free pauses a project after 7 days without traffic | The API fails its health check until you resume the project | Resume it in the Supabase dashboard before an exam, or upgrade |
| Supabase free has no automatic backups you can restore | Data loss risk | Run the `pg_dump` below before each exam and after grading |

For real exams with stakes, move the API to Render Starter (always on) and Supabase Pro (daily
backups). Nothing else changes.

### 1. Supabase (database)

1. Create a project at <https://supabase.com/dashboard>. Pick region **Central EU (Frankfurt)**
   to sit next to Render's `frankfurt` region. Save the database password it shows.
2. **SQL Editor → New query**: paste [`deploy/supabase-setup.sql`](../deploy/supabase-setup.sql),
   replace the placeholder password with a long random one (`openssl rand -base64 32 | tr -d '/+='`),
   and run it. It creates the `examguard` role and a private `examguard` schema. ExamGuard does
   not use the `public` schema, because Supabase's Data API exposes `public` to the anon key.
3. Optional but recommended: **Project Settings → Data API**: turn the Data API off. ExamGuard
   never uses it.
4. **Connect** (top bar) → **Session pooler**. Note the host, e.g.
   `aws-0-eu-central-1.pooler.supabase.com`, port `5432`, and the project ref in the user name
   (`postgres.<ref>`).

   Use the **session pooler**, not the direct connection (`db.<ref>.supabase.co`): the direct host
   is IPv6-only and Render cannot reach it. Do not use the transaction pooler (port `6543`);
   Flyway needs a session.

The Render values, built from that:

```
SPRING_DATASOURCE_URL=jdbc:postgresql://aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&currentSchema=examguard
SPRING_DATASOURCE_USERNAME=examguard.<project-ref>
SPRING_DATASOURCE_PASSWORD=<the password you put in supabase-setup.sql>
```

On first boot Flyway creates every table in `examguard` and Hibernate validates the result
(`ddl-auto: validate`); a mismatch stops startup instead of drifting. The schema must be empty
before the first boot.

### 2. Render (API + analysis service)

1. Merge to `main`; Render deploys from `main` only.
2. <https://dashboard.render.com> → **New → Blueprint** → connect GitHub and pick this repository.
   Render reads [`render.yaml`](../render.yaml) and shows two services plus the
   `examguard-shared` environment group.
3. Fill the prompted values:

   | Key | Value |
   | --- | --- |
   | `SPRING_DATASOURCE_URL` / `_USERNAME` / `_PASSWORD` | from step 1 |
   | `ANALYSIS_BASE_URL` | `https://examguard-ai.onrender.com` (adjust if Render added a suffix to the name) |
   | `CORS_ALLOWED_ORIGINS` | your Vercel production URL, e.g. `https://examguard.vercel.app`. Use a placeholder now and correct it after step 3 |
   | `BOOTSTRAP_ADMIN_EMAIL` | the first administrator's email |
   | `BOOTSTRAP_ADMIN_PASSWORD` | 12+ characters; you change it after the first sign-in |
   | `MAIL_HOST`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM` | your SMTP relay, or leave empty while `MAIL_ENABLED=false` |

   `JWT_SECRET` and `ANALYSIS_TOKEN` are generated by Render; never set them by hand.
4. **Apply**. The first API build takes about 5–10 minutes. Watch **Logs** for
   `Created the bootstrap administrator` and `Started ExamGuardApplication`.
5. Copy the API's URL (e.g. `https://examguard-api.onrender.com`) for step 3.

`autoDeployTrigger: checksPass` makes Render wait for GitHub CI to pass on `main` before each
deploy, and `buildFilter` rebuilds a service only when its own folder changed.

The PIN and login throttles count failures per client address, taken from Render's
`X-Forwarded-For` (`server.forward-headers-strategy: native`, trusting private-range proxies). If
five wrong PINs from one student start blocking everyone, Render's proxy is connecting from
outside those ranges: set `SERVER_TOMCAT_REMOTEIP_INTERNALPROXIES` to a regex matching it.

`/actuator/health` deliberately ignores SMTP, so a mail outage never takes the API offline.

**PIN email**: set `MAIL_ENABLED=true` and the `MAIL_*` values for a relay such as Resend, Brevo,
Postmark or SendGrid (SMTP port 587, STARTTLS). Until then the lecturer reads the PIN from the
**Access PIN** card.

### 3. Vercel (frontend)

1. <https://vercel.com/new> → import this repository.
2. **Root Directory**: `frontend`. The Vite preset and [`frontend/vercel.json`](../frontend/vercel.json)
   supply the build. **Production Branch** (Settings → Git): `main`.
3. Environment variable (Production):

   | Variable | Value |
   | --- | --- |
   | `VITE_API_BASE` | `https://examguard-api.onrender.com/api` (absolute, ends in `/api`) |
   | `VITE_DEFAULT_EXAM_CODE` | optional join-page default |

   `VITE_API_BASE` is baked in at build time. A Vercel build without an absolute `https://…/api`
   value fails on purpose instead of shipping a site whose API calls hit the static files.
4. Deploy, then copy the production domain back into Render's `CORS_ALLOWED_ORIGINS` (exact
   origin, no trailing slash; comma-separate a custom domain too). Saving it redeploys the API.

`vercel.json` sends security headers on every page: a Content-Security-Policy that only allows
API calls to `https://*.onrender.com`, `Permissions-Policy` granting the camera, microphone and
fullscreen to this site only (the pre-exam wizard needs all three), HSTS, `X-Frame-Options: DENY`
and immutable caching for hashed assets. **If you move the API to a custom domain, add it to
`connect-src` in `vercel.json`**, or every API call is blocked by the browser.

Preview deployments get random URLs that are not in `CORS_ALLOWED_ORIGINS`; they load but cannot
call the API. That is intentional.

### 4. First sign-in and smoke test

```bash
curl -fsS https://examguard-api.onrender.com/actuator/health   # {"status":"UP"}
curl -fsS https://examguard-ai.onrender.com/health             # "status":"UP"
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://examguard-ai.onrender.com/analyze/pairs -H 'Content-Type: application/json' -d '{}'
# 401: the analysis service refuses calls without the token
```

1. Open the Vercel URL → `/login` and sign in with the bootstrap administrator.
2. In Render, delete `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`. They are ignored once
   an admin exists, but should not linger. There is no password-change screen yet, so the
   bootstrap password stays the admin password: make it long and keep it in a password manager.
3. Create lecturer and reviewer accounts. The portal has no user-management screen yet, so use
   the admin API:

   ```bash
   API=https://examguard-api.onrender.com/api
   TOKEN=$(curl -fsS -X POST $API/auth/login -H 'Content-Type: application/json' \
     -d '{"email":"admin@your-domain.example","password":"<admin password>"}' | jq -r .token)
   curl -fsS -X POST $API/admin/users -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"email":"lecturer@your-domain.example","displayName":"Dr Lecturer","password":"<12+ chars>","role":"LECTURER"}'
   ```

   `role` is `ADMIN`, `LECTURER` or `REVIEWER`. Students register themselves on `/student`.
4. As a lecturer: create an exam, issue a PIN, join it from a private window as a student, pass
   the pre-exam checks (camera, microphone and fullscreen prompts must appear), answer, submit.
5. Run analysis on the exam; findings appearing proves the API reaches the analysis service with
   the token.

### Cloud backup and restore

Supabase free keeps no backups you can restore. From a machine with PostgreSQL 16 client tools:

```bash
pg_dump "postgresql://examguard.<ref>:<password>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require" \
  --schema=examguard --no-owner --format=custom --file=examguard-$(date +%F).dump

# restore into an empty examguard schema
pg_restore --dbname="<same connection string>" --no-owner --schema=examguard examguard-YYYY-MM-DD.dump
```

### Cloud rollback

Render → service → **Events** → pick an earlier successful deploy → **Rollback**. Vercel →
**Deployments** → earlier deployment → **Promote to Production**. Flyway migrations are
forward-only: if a release added a migration, restore the pre-release dump instead of rolling the
API back onto a newer schema.

## Backup

```bash
docker compose -f docker-compose.prod.yml exec mysql \
  mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" --single-transaction examguard > examguard-$(date +%F).sql
```
