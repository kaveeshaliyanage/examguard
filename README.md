# ExamGuard AI

[![CI](https://github.com/kaveeshaliyanage/examguard/actions/workflows/ci.yml/badge.svg)](https://github.com/kaveeshaliyanage/examguard/actions/workflows/ci.yml)
[![CD](https://github.com/kaveeshaliyanage/examguard/actions/workflows/cd.yml/badge.svg)](https://github.com/kaveeshaliyanage/examguard/actions/workflows/cd.yml)

Multi-evidence review of online examination submissions. Students take a typed exam in the
platform; permitted browser activity is observed by an optional Chrome extension; after submission a
Python analysis service produces three **separate** kinds of review findings:

| Output | Purpose |
| --- | --- |
| Candidate incident | One candidate's observed resource use, coverage gaps and nearby answer changes. |
| Candidate pair | Similarity, distinctive shared patterns and timing relationships between two candidates. |
| Candidate authorship | Stylometric signals in one candidate's prose (review aid, capped at MEDIUM priority). |

A website visit by one candidate never contributes to a pair finding. The isolation is structural:
the backend sends pair analysis a payload that cannot contain activity events, and sends incident
and authorship analysis separate single-candidate payloads. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

`priorityScore` (0-100) is **review priority**, not a probability of misconduct. Nothing in this
system decides that a student cheated. Lecturers review the evidence and record a decision with a
rationale. Coverage warnings are shown wherever evidence is incomplete: missing observations are
unknown, not clean.

The authorship score is capped at **54**, so stylometry alone can never reach HIGH or CRITICAL. It
describes how an answer was written; it is not proof that AI was used, and copying remains the pair
model's job.

## What is in the repository

| Part | Stack | Status |
| --- | --- | --- |
| `backend/` | Java 21, Spring Boot 3.4, Security, JPA, Flyway, MySQL/PostgreSQL | Complete: auth with student accounts, typed exams and authoring (including coding questions), exam PINs with email delivery, supervised pre-exam window with identity photo, server-clocked deadline with auto-submit, attempts and the 3-strike integrity policy, auto + manual grading with a release gate, sandboxed code judging, reports and PDF export, dashboards, analysis orchestration, findings, decisions, audit |
| `ai/` | Python, FastAPI, scikit-learn | Complete: similarity, rare patterns, cross-question reuse, timing, coverage, domain rules, priority fusion, authorship stylometry (capped at 54), isolated payloads |
| `frontend/` | React 18, TypeScript strict, Vite 5, MUI 5, TanStack Query/Table, recharts | Complete: staff and admin dashboards, exam authoring with preview, PIN card, grading queue, findings review, decisions, audit, student dashboard, pre-exam checks wizard (fullscreen, connection, device, mic/noise, camera/gaze, photo), typed question renderer, code editor, integrity dialog, reports |
| `runner/` | Python 3.12, FastAPI | Complete: sandboxed Python/JavaScript/Java execution (per-test output, time limit, output cap, no egress, non-root, read-only rootfs) |
| `extension/` | Chrome MV3, TypeScript | Complete: domain-only observation, persistent queue, batching, backoff, reconnect flow |
| `ai/app/training/` | scikit-learn, joblib | Complete: synthetic cohort generators, feature export, calibrated pair/incident/authorship training, model cards, external-corpus adapter |
| `.github/workflows/` | GitHub Actions | Complete: test jobs (backend, PostgreSQL, AI, AI evaluation gates, runner, frontend bundle budget, extension), compose smoke with Playwright, GHCR image publishing on tags, optional VPS deploy |
| `kaggle/` | Kaggle CLI | Complete: private dataset, offline training notebook, model storage |

Tests: 113 backend, 61 AI, 90 frontend, 23 runner, 13 extension. The AI suite includes a 100-candidate
timing benchmark and an export/training/inference consistency check.

## Quick start with Docker

```bash
cp .env.example .env            # set JWT_SECRET to 32+ random characters
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:8080/api
- Analysis service: http://localhost:8000/docs
- MySQL: `localhost:3307`
- PIN emails (Mailpit inbox): http://localhost:8025

```bash
curl http://localhost:8080/api/health
# {"status":"UP","database":"UP","analysis":"UP"}
```

Demo accounts created on first start:

| Role | Email | Password |
| --- | --- | --- |
| Administrator | admin@examguard.local | Admin123! |
| Lecturer | lecturer@examguard.local | Lecturer123! |
| Reviewer | reviewer@examguard.local | Reviewer123! |
| Student | student@examguard.local | Student123! |

Three demo exams are seeded (`SEED_DEMO_DATA=true`):

| Exam | Content |
| --- | --- |
| `DEMO-101` | Candidate codes `C001` ... `C008` for pair and incident review. |
| `DEMO-102` | Five typed questions (one of each type), two scripted candidates and a released result for `C101`. |
| `DEMO-103` | Three coding questions judged by the runner, with a released attempt and an awaiting one; `student@examguard.local` is enrolled. |

## Demo flow

1. Sign in as lecturer at `/login`, open `DEMO-101`, click **Run analysis**.
2. **Pairs** tab: `C001`/`C002` share a rare phrase and have aligned answer changes.
3. **Incidents** tab: `C004` visited a prohibited domain shortly before an answer change.
4. **Authorship** tab: stylometric review flags, capped at MEDIUM.
5. Open a finding, inspect evidence and answer revisions, record a decision and a rationale
   (at least 10 characters). Every decision is audited.
6. Open `DEMO-102` → **Grading** to mark the essay, then **Release results**. Sign in as
   `student@examguard.local` to see the released score and download the PDF report.
7. Student side: `/join` with `DEMO-101`, a fresh candidate code such as `C009`, and the seeded
   demo PIN `246810`. The pre-exam wizard runs fullscreen, connection, device, mic/noise,
   camera/gaze and a photo; confirming it starts the exam clock. Answer, submit, then run analysis again. Leaving the tab is recorded; the
   third focus loss ends the attempt.
8. PIN email: as the lecturer, open an exam → **Settings** → **Access PIN** → **Issue PIN**. In
   compose the email lands in Mailpit at http://localhost:8025; the PIN is also shown once.

The extension is optional. Load `extension/dist` as an unpacked extension, connect it with the
attempt's collector token shown on the student page, and only domains and event times are sent.
Page content, URLs with paths and keystrokes are never collected, and there is no continuous video:
the only image is the one-time identity photo taken in the pre-exam wizard.

## Training the models

The rule weights are the default and need no artifacts. To fit the optional learned fusion:

```bash
cd ai
python -m app.training.export --out data --pair-cohorts 150 --incident-cohorts 150
python -m app.training.train  --data data --out models
```

Then set `USE_LEARNED_FUSION=true`. The models are trained on synthetic cohorts and the published
score remains a review priority, not a probability of misconduct. Metrics, splits, circularity
limits and the external-corpus adapter are in [`docs/TRAINING.md`](docs/TRAINING.md); Kaggle
publishing is documented in [`kaggle/README.md`](kaggle/README.md).

## Local development (without Docker)

Prerequisites: JDK 21, Maven 3.9+, Node 20+, MySQL 8 (port 3307 by default), Python 3.11-3.13.

```bash
# 1. database (or use docker compose up mysql)
mysql -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE IF NOT EXISTS examguard"

# 2. analysis service
cd ai
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m uvicorn app.main:app --reload --port 8000

# 2b. code runner (needed for coding questions; backend defaults to http://localhost:8001)
#     The runner fails closed without RUNNER_TOKEN; the backend must send the same value.
cd runner
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
RUNNER_TOKEN=dev-runner-token python -m uvicorn app.main:app --port 8001

# 3. backend
cd backend
JWT_SECRET=$(openssl rand -hex 32) RUNNER_TOKEN=dev-runner-token mvn spring-boot:run

# 4. frontend
cd frontend
npm ci
cp .env.example .env.local
npm run dev                      # http://localhost:5173, proxies /api to :8080

# 5. extension
cd extension
npm ci
npm run build                    # then load extension/dist unpacked
```

Tests and checks:

```bash
cd backend   && mvn test
cd ai        && pytest -q && python -m app.evaluation.run_eval
cd runner    && pip install -r requirements-dev.txt && pytest -q
cd frontend  && npm run lint && npm test && npm run typecheck && npm run build && npm run budget
cd extension && npm test && npm run typecheck && npm run build
```

The extension popup asks for the API base URL (default `http://localhost:8080/api`) and the
collector token for an in-progress attempt. The backend accepts `chrome-extension://*` origins
because the manifest deliberately keeps `host_permissions` empty.

## Configuration

All backend configuration is environment driven; see [`.env.example`](.env.example).
`JWT_SECRET` must be at least 32 bytes, and `RUNNER_TOKEN` must be the same in the `backend` and
`runner` containers (the runner answers 503 on `/run` when it is unset). Schema changes are Flyway
migrations only; production profiles use `ddl-auto: validate` and never `update`. Frontend build-time variables are documented
in [`frontend/.env.example`](frontend/.env.example).

## Deliberately out of scope

Grading, question banks, scheduling, lock-down browsers, video proctoring, keystroke capture,
social-media checks, automated sanctions, SSO/LTI, multi-tenancy and mobile apps. This is a triage
and research platform for low-stakes demonstrations and consented pilots, not a replacement for
institutional assessment systems.

## Production hardening checklist

The code is production-shaped, not certified for real graded examinations. Before any real use:

- Complete an ethics/DPIA review, student disclosure and consent flow.
- Replace the demo JWT secret, use HTTPS, rotate secrets, add rate limiting and account lockout.
- Sign and distribute the extension through an organisation policy; pin its ID.
- Add observability (structured logs, metrics, tracing), backups, retention and deletion jobs.
- Validate the analysis on held-out cohorts and calibrate or remove any displayed numeric score.
  Synthetic-cohort metrics are not a substitute for a consented pilot.
- Provide an appeal path and human oversight. The EU AI Act treats AI that detects prohibited
  behaviour during tests as high-risk; obligations apply to real deployments.
- Set `SEED_DEMO_DATA=false` and keep the demo accounts out of production.

More detail: [`docs/ETHICS_AND_LIMITS.md`](docs/ETHICS_AND_LIMITS.md),
[`docs/EVALUATION.md`](docs/EVALUATION.md), [`docs/TRAINING.md`](docs/TRAINING.md),
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/HANDOFF.md`](docs/HANDOFF.md).
