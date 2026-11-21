# Handoff: ExamGuard AI

ExamGuard AI is a **review-triage** tool for short-answer online exams. It does not decide that a
student cheated. It produces two outputs that must stay separate:

| Output | Contains | Never contains |
| --- | --- | --- |
| Candidate incident | One candidate's resource visits, monitoring coverage, answer changes near a flagged visit | Another candidate's answers or similarity |
| Candidate pair | Similarity, distinctive shared wording, revision timing between two candidates | Website visits or any activity event |

**The isolation rule is the product's core safety property.** A candidate visiting `chegg.com` must
never raise a pair finding against everyone whose answers resemble theirs. The rule is enforced in
three places:

1. `backend/.../dto/AnalysisDtos.java` — `PairAnalysisRequest` has no event/rule fields.
2. `ai/app/schemas.py` — Pydantic models use `extra="forbid"`; unknown fields are rejected with 422.
3. `ai/app/services/analyzer.py` — pairs and incidents are separate functions with separate inputs.

A `priorityScore` (0–100) is **review priority**, never a probability of misconduct. Bands are
LOW 0–29, MEDIUM 30–54, HIGH 55–74, CRITICAL 75–100. Coverage warnings travel with the finding.

## 1. Current state (verified 2026-11-07)

| Area | State | Verification performed |
| --- | --- | --- |
| Flyway schema (MySQL V1+V2, PostgreSQL V1+V2) | Complete | `flyway migrate` + Hibernate `ddl-auto: validate` against MySQL 8.4 and PostgreSQL 16 |
| JPA domain + repositories | Complete for all 20 tables | Context tests and live MySQL boot |
| Staff and student JWTs | Complete | `JwtServiceTest`, `AuthApiTest`, `AccessScopeITest` |
| Student accounts | Complete | `StudentAccountITest`: register, login, attempt linking, link conflict |
| Exam authoring, permissions, audit | Complete | `ExamApiTest`, `QuestionFields`/`CreateExamPage` tests |
| Typed questions and answer keys | Complete | `AnswerKeyLeakTest`, `QuestionFields.test.ts`; serialization never exposes keys to students |
| Attempt lifecycle, strikes, auto-grading | Complete | `AttemptStateMachineTest`, `StrikeServiceITest`, `AutoGradingTest`; live MySQL confirms 3 strikes → `TERMINATED`/`FOCUS_LOSS_LIMIT`, saving after termination returns 409, and autosave no longer clears a committed strike |
| Manual grading and release gate | Complete | `GradingTab.test.tsx`, `DashboardApiTest`, `ReleaseGateApiTest` (release refused while any answer is unscored), report 403 before release |
| Reports and PDF export | Complete | `CsvWriterTest`, `PdfRendererTest` (magic bytes + embedded fonts), `ReportApiTest` (release gate, key after release, PDF text, staff-only review signals), `StudentReportPage.test.tsx`, exam CSV/PDF and admin overview export buttons |
| Analysis orchestration | Complete | `AnalysisFlowTest`, `AnalysisPayloadIsolationTest` |
| Authorship analysis | Complete | `AuthorshipAnalysisTest` (cap + single-candidate context), 61 AI tests, CI evaluation gate |
| Review workflow | Complete | `ReviewWorkflowTest`; live decision and audit |
| Python analysis service | Complete | 61 pytest tests; live pair, incident and authorship output |
| Dashboards | Complete | `DashboardApiTest`, `LecturerDashboardPage.test.tsx`, `AdminDashboardPage.test.tsx`; `/admin` adds the cross-exam findings queue with type/band/status filters |
| React UI | Complete | 83 Vitest tests (25 files, includes the axe suite), `tsc --noEmit`, `vite build`, bundle budget, 3 Playwright flows |
| Chrome MV3 extension | Complete | 13 Vitest tests, typecheck, build; extension-origin API simulation |
| Docker Compose stack | Complete | Full stack run 2026-11-07: health `UP/UP/UP`, login, analysis, decision, audit, student join/save/submit/rejoin through the nginx proxy; Playwright join → strikes → terminate → grade → release → PDF also passes through nginx at `:5173` |
| CI | `.github/workflows/ci.yml`: backend, backend-postgres, ai, ai-eval, frontend (+budget), extension, compose (+Playwright) | Green on `main` and `develop` before this change; the new jobs are added and run on the next push |
| CD | `.github/workflows/cd.yml`: GHCR images, extension release, optional VPS deploy | `v0.1.0` published three images and a release with the extension zip |

Exact verified results (2026-11-07):

```text
backend:  mvn test   -> 76 tests, 0 failures (1 PostgreSQL test skipped without TEST_PG_URL)
ai:       pytest -q  -> 61 tests, 0 failures
frontend: npm test   -> 46 tests, 0 failures (tsc and vite build pass; 337.9 kB gzip JS)
e2e:      3 Playwright flows via installed Chrome -> join/grading, 3-strike termination, released PDF
extension: npm test  -> 13 tests, 0 failures (tsc and vite build pass)
live:     /api/health -> {"status":"UP","database":"UP","analysis":"UP"}
live:     DEMO-101 run -> pair C001/C002, incidents C004 (HIGH) and C007 (coverage warning)
live:     decision NEEDS_INFO accepted, FINDING_DECISION audit entry written
train:    pair AP 0.805 / AUC 0.963; incident AP 1.0; authorship AUROC 1.0 / TPR@5%FPR 1.0 /
          ECE 0.012 (all synthetic holdouts)
```

Phase 2 verification (2026-11-08):

```text
backend:  mvn test            -> 90 tests, 0 failures (1 PostgreSQL test skipped without TEST_PG_URL)
postgres: PostgresSchemaTests -> Flyway V1+V2+V3 applied on PostgreSQL 16.15, Hibernate validate pass
frontend: npm test            -> 66 tests, 0 failures (21 files, includes the axe suite)
frontend: tsc --noEmit         -> clean
frontend: vite build + budget -> 346.7 kB gzip JS (budget 420 kB)
roster:   ExamRosterITest     -> 7 tests (add/list/remove, duplicate 409, non-owner 403,
          unenrolled 403, guest 403, empty roster open, window 409, resume after close)
settings: ExamSettingsApiTest -> 5 tests (update + audit, schedule on create, window 400,
          validation, non-owner 403)
dashboard: DashboardApiTest   -> upcoming, 14-day trend, band mix, four funnel stages
compose:  docker compose up --build --wait -> health UP/UP/UP; Flyway V3 applied on MySQL 8.4
e2e:      3 Playwright flows via installed Chrome -> pass (51.9 s)
auth:     staff login            -> student account refused with 401 "Students sign in at the student portal"
report:   released report        -> summary reads "7 of 20 possible points awarded"; no undefined fields
print:    Playwright emulateMedia(print) on the released report -> appbar and buttons display:none,
          ring not clipped, summary "7 of 20 possible points awarded", no console errors
manual:   browser pass -> settings save + EXAM_SETTINGS_UPDATED, roster list, question preview,
          keyboard moved to "Candidate 2 of 8", student upcoming "Scheduled / Opens …", all three
          dashboard charts with accessible names; no console errors
```

The demo run produced `HIGH` review priority for C004, `LOW` for C001/C002 and C007, and a coverage
warning on C007. C008 and a candidate without the extension produced no incident: unknown activity is
not treated as clean. Pair evidence carried only `SIMILARITY`, `PATTERN` and `TIMING` sources; incident
evidence carried only `ACTIVITY`, `ANSWER_CHANGE`, `PATTERN` and `COVERAGE`, and never a second
candidate. Authorship findings carry one candidate and `AUTHORSHIP` evidence only.

This environment's link was too slow to pull the `eclipse-temurin:21-jre` base image, so the stack was
run with the backend image built from the host-produced jar. The committed `backend/Dockerfile` is
unchanged in behaviour and is exercised by the CI compose job and release builds.

## 1a. Exam portal additions (Phase 1 of the portal plan)

| Addition | Behaviour |
| --- | --- |
| Question types | `SINGLE_CHOICE`, `MULTI_CHOICE`, `TRUE_FALSE`, `SHORT_ANSWER`, `ESSAY`, `CODE`; `AUTO` or `MANUAL` grading; answer keys (including coding test cases) never leave the server |
| Attempt lifecycle | `IN_PROGRESS → SUBMITTED / TERMINATED / EXPIRED` through `AttemptStateMachine` |
| Focus policy | `POST /api/attempts/{id}/integrity/signals` with `UNIQUE(attempt_id, episode_key)`; the third `FOCUS_LOSS` terminates the attempt and auto-grades saved answers. Answers stay in local state and are flushed on resume |
| Grading | All-or-nothing for single/true-false, proportional for multi-choice, manual queue for short answer/essay |
| Release gate | Student reports return 403 until `released_at` |
| Student accounts | `role=STUDENT` plus a `scope` claim (`ATTEMPT` vs `ACCOUNT`); account join links an attempt and rejects a second account |
| Reports | Student, exam and admin reports; synchronous PDF rendering with bundled fonts; CSV export above 500 attempts |
| Dashboards | `/api/dashboard/student`, `/lecturer`, `/admin` plus React pages |
| Authorship | `POST /analyze/authorship`; backend persists `CANDIDATE_AUTHORSHIP` findings capped at 54/MEDIUM |

## 1b. Phase 2 portal additions (verified 2026-11-08)

| Addition | Behaviour |
| --- | --- |
| Exam schedule | `exam.opens_at` / `exam.closes_at` are editable (`POST /api/exams`, `PATCH /api/exams/{id}`) and enforced for **new** joins only. An `IN_PROGRESS` attempt always resumes, even after `closes_at` |
| Student roster | `exam_enrollment` (V3, MySQL + PostgreSQL) with `UNIQUE(exam_id, email)`; `GET/POST/DELETE /api/exams/{id}/roster` (owner writes). A non-empty roster restricts joins to enrolled account emails; guests are refused. An empty roster keeps join by exam code |
| Student upcoming exams | `GET /api/dashboard/student` returns `upcoming` for enrolled, `OPEN`, not-yet-joined exams; `/student` shows an upcoming card with Join prefill (candidate code still typed) |
| Editable settings | `PATCH /api/exams/{id}` replaces title, description, duration (5–600), allowExtension, maxStrikes (1–10), instructions, schedule and resource rules. Exam code is immutable. Owner only; audit `EXAM_SETTINGS_UPDATED` lists changed fields. Editing stays allowed after candidates join |
| Settings UI | `ExamSettingsForm` with `UnsavedChangesGuard`, roster card, Results card (`releasedCount`/`awaitingReleaseCount` → grading) |
| Authoring preview | Edit/Preview toggle in the question dialog renders the draft through the student `QuestionRenderer`; preview answers are never saved |
| Grading keyboard | Previous/next candidate buttons plus ArrowUp/Left/j and ArrowDown/Right/k, ignored inside inputs; "Candidate N of M" |
| Lecturer charts | Score histogram plus integrity trend (14 UTC days), band mix and Attempts → Submitted → Graded → Released funnel, each with an empty state |
| URL-synced tables | `lib/tableState.ts` shared by exam list, findings and the migrated attempts table |
| Accessibility | axe suite over login, join, three dashboards, exam overview, grading and report; `aria-modal="true"` and initial focus asserted for the integrity warning, question dialog and unsaved-changes guard |

## 1c. Phase 3 coding additions (verified 2026-11-08)

| Addition | Behaviour |
| --- | --- |
| `CODE` question type | `PYTHON`, `JAVASCRIPT`, `JAVA`; starter code plus up to 20 staff-only test cases (stdin, expected stdout, hidden flag). Created through `POST /api/exams/{id}/questions`; a question with at least one test defaults to `AUTO`, otherwise `MANUAL` with a reference solution or rubric |
| Sandboxed runner | `runner/` (FastAPI) runs each submission in a fresh temp dir with a 2 s limit, 8 KB output truncation, process-group kill, non-root uid 10001, read-only rootfs, `tmpfs /tmp`, `cap_drop ALL`, no-new-privileges, `mem_limit`/`pids_limit`, and an **internal-only** compose network with no egress. Backend calls it at `http://runner:8000`; it publishes no host port |
| Judging | After submit, `AUTO` coding answers run against their tests. Partial credit `points × passed / total` (2 dp), compile error 0 with `COMPILE_ERROR`, per-test detail stored in `answer_grade.detail_json` (V4). Runner outage leaves the answer **ungraded**, never zero; `POST /api/exams/{id}/code-judge` re-runs and never overwrites a `MANUAL` grade |
| Answer storage | `CODE` text is stored verbatim (CRLF/CR → LF only); prose still whitespace-collapsed. Test cases stay in the staff-only `answerKeyJson`; candidates see only language + starter |
| Fairness | `AnalysisPayloadBuilder` removes `CODE` questions from pair and authorship payloads — identical correct solutions are expected, not collusion. Incident payloads keep every answer; focus-loss signals are unaffected |
| UI | `CodeEditor` (dependency-free textarea + line-number gutter, Tab/Shift+Tab/Enter indentation) in authoring, attempt and preview; test-case editor; read-only `CodeBlock` plus per-test result chips in grading and the student report; Re-run code judging button |
| Demo | `DEMO-103` "Coding (DSA)" seeds three coding questions, a released attempt (C201) scored by the runner and an awaiting one (C202), with `student@examguard.local` enrolled |

## 1d. Phase 3 grading and review additions (verified 2026-11-08)

| Addition | Behaviour |
| --- | --- |
| Release requires every answer scored | `POST /api/exams/{id}/grades/release` first checks each not-yet-released attempt for a question without an awarded score and returns `409` with `n attempt(s) still have ungraded answers…`. Auto-grading stamps `gradedAt` at submit, so the old "graded" filter alone could publish partial marks; `ReleaseGateApiTest` pins both the refusal and the retry |
| Unreleased rows stay locked | `/student` results rows for unreleased attempts show the "Not released" chip and an info toast instead of navigating into the 403 report |
| Report exports in the UI | Exam detail header has **Export CSV** / **Export PDF** (`GET /api/reports/exams/{id}/csv|pdf`, saved as `<exam-code>-report.<ext>`); `/admin` has **Download overview PDF** (`GET /api/reports/admin/overview/pdf`) |
| Cross-exam findings queue | `GET /api/findings?examId=&type=&status=&band=&limit=` returns `FindingOverviewRow`s with their exam; admins/reviewers see all, lecturers only exams they can view; `/admin` renders it with type/band/status filters |
| Review signals are staff-only | `ReportService` returns `reviewSignals: []` to students, so the student page and PDF never show overlap/authorship aids |

```text
backend:  mvn test              -> 105 tests, 0 failures (1 PostgreSQL test skipped without TEST_PG_URL)
release:  ReleaseGateApiTest    -> 2 tests (409 with an unscored answer, retry releases, already-released not counted)
queue:    FindingOverviewApiTest-> 4 tests (admin vs lecturer scope, band/type filters, examId 403)
report:   ReportApiTest         -> 6 tests (student reviewSignals empty, staff sees band/labels)
frontend: npm test              -> 83 tests, 0 failures (25 files, axe included)
frontend: tsc --noEmit          -> clean
frontend: vite build + budget   -> 350.7 kB gzip (budget 420 kB)
```

## 1e. Production-readiness pass

| Change | Behaviour |
| --- | --- |
| Resuming needs proof | `POST /public/join` on an existing attempt requires the attempt token issued by the first join, or a signed-in student account that owns the attempt. Wrong or absent proof is `403`, closing the code-alone takeover. The frontend sends the token it already stores for the same exam + candidate codes |
| Submit refuses unsaved answers | The autosave `flushAll` re-checks every entry after the final flush and throws when one is halted or not up to date, so the editor reports "Some answers could not be saved" instead of submitting a partial attempt |
| Runner is authenticated | `/run` requires `X-Runner-Token` (503 when unset, 401 on mismatch, `/health` stays open); compose passes the same `RUNNER_TOKEN` to `runner` and `backend` |
| Runner sheds load | A non-blocking slot acquire returns `429 Retry-After: 5`; the total budget is 75 s (below the backend's 90 s read timeout) and every language gets `RLIMIT_CPU` |
| Secure defaults | No baked-in JWT secret, `SEED_DEMO_DATA` defaults to `false`, and error responses carry no message, binding errors or stack trace |
| Keyboard table rows | Clickable `DataTable` rows are focusable and respond to Enter/Space, with a visible focus ring |
| Pipeline gates | CI runs read-only with per-job timeouts and an ESLint step; CD refuses to publish unless the tagged commit's CI jobs succeeded, and a prerelease tag does not move `latest` |
| Same-origin proxy | nginx clears `Origin` before proxying `/api`, so the browser's same-origin calls are not re-checked by Spring CORS against a host missing from `CORS_ALLOWED_ORIGINS` (previously every proxied POST answered `403 Invalid CORS request` on a custom port) |

### Verification (2026-11-21)

Measured on this pass (Windows 11, Docker Desktop 29.9.2, compose stack on non-default host ports):

| Suite | Result |
| --- | --- |
| Backend (H2) | 113 tests, 0 failures, 1 skipped |
| Backend (PostgreSQL 16, Flyway plus `ddl-auto: validate`) | 113 tests, 0 failures, 0 skipped |
| AI | 61 tests, 0 failures |
| Runner (inside the image) | 23 tests, 0 failures |
| Frontend | ESLint clean, `tsc --noEmit` clean, 90 tests across 26 files, production bundle 351.3 kB gzip (budget 420 kB) |
| Extension | typecheck clean, 13 tests, production build OK |
| Compose stack | MySQL, AI, runner, backend and frontend all healthy; an authenticated runner run returns `200` and a missing token `401` |
| Playwright (compose, Chrome) | 6/6: coding submit then judge 3/3 passed, exam flow three times, CSV and PDF export, admin findings plus overview PDF |
| Manual walkthrough | lecturer tabs and the disabled release gate with 10 ungraded answers; CODE authoring form; locked student row toast; report `403` before release and no review signals after; admin findings filters, run history and audit trail |

## 2. Known gaps

- The CD deploy job is written but has never touched a VPS; `scripts/deploy.sh` was only syntax
  checked. Set `VPS_*` secrets, `VPS_APP_DIR`, log the server in to GHCR and set
  `DEPLOY_ENABLED=true` before relying on it. Release `v0.1.0` proves the image and release jobs.
- `render.yaml` and `frontend/vercel.json` declare the cloud topology, but the Render, Supabase and
  Vercel projects have not been created yet. The cloud smoke test in `docs/DEPLOYMENT.md` is the
  release gate for that step.
- The Playwright flows run against the compose stack through nginx: join → answer → submit →
  grading, two focus losses → resume → third blur terminates (state confirmed in MySQL), and the
  student account downloading the released PDF report.
- Focus-loss strikes are **recorded signals, not enforcement**. The extension cannot block other
  tabs or applications, and the UI says so.
- The compose smoke job caught one real bug on its first run (the frontend healthcheck probed
  `localhost`, which resolves to IPv6 inside the container). The IPv4 probe passed on the next
  green run and locally.
- The extension passed unit tests and its API calls were simulated with a `chrome-extension://`
  origin, but it was not loaded into a packaged Chrome profile in this environment.
- H2 tests use `ddl-auto: create-drop`; they do not validate the Flyway schema. The live MySQL run
  does validate it.
- Semantic embeddings are optional and disabled by default. Learned fusion is experimental and off
  by default; when enabled it must keep the same caps as the rule path.
- The synthetic evaluation and the trained models measure the simulator. Never present their numbers
  as real-world accuracy.
- The demo seeder uses scripted content. It is not evidence about real people.
- Rejoining a *submitted* attempt returns 409; only in-progress attempts resume. This is intentional
  but the student page shows a generic error for that case.
- Resuming an in-progress attempt now requires proof (the stored attempt token, or the signed-in
  account the attempt was joined with). A candidate who loses the tab **and** the browser session
  cannot resume anonymously; they must sign in or ask an invigilator. That is the deliberate
  trade-off for closing the takeover gap. `POST /public/join` returns 403 with a resume-specific
  message, and the join page explains it.
- Compose now requires `RUNNER_TOKEN`; an existing local `.env` copied before this change must add
  it (`.env.example` has a placeholder) or `docker compose up` refuses to start.
- `runner/requirements*.txt` are hash-pinned for CPython 3.12 on linux/x86_64 and are meant to be
  installed inside the runner image. Installing them on a Windows host will fail hash verification.
- Duration is evaluated when an attempt is **submitted**, so shortening `durationMinutes` mid-exam does
  not move a running countdown; it only changes what counts as late. The settings form says so.
- `upcoming` deliberately omits an `attemptId`: exams with any attempt (including in-progress) are
  excluded from the list and appear in the attempts section instead, so the card never duplicates a
  resumable attempt. Scheduling is enforced only when a new attempt is created.
- Roster membership is matched on the account email; a guest student (no account) cannot join a
  rostered exam even with the exam code. That is the intended trade-off for exams that need a roster.
- Closing an MUI dialog logs one Chrome warning about `aria-hidden` on the focused element while focus
  is restored (MUI 5 internal ordering). It is a warning, not an error, and the axe focus assertions
  pass; no page functionality is affected.
- Coding judging needs the `runner` container. Without it, submit still succeeds and the answers stay
  **ungraded** (never zero); start the runner and press **Re-run code judging**. The sandbox is process
  isolation (no egress, non-root, read-only rootfs, dropped capabilities, rlimits), not a proven
  security boundary for hostile code.
- The sandbox limits are fixed at 2 s and 8 KB of output per attempt; Java gets one compile shared by
  all its tests, and JS/JVM get heap caps instead of an address-space cap (they reserve far more
  virtual memory than they use). Starter code is trimmed on save; submitted code is stored verbatim.
- Authoring a `CODE` question without `gradingMode` defaults it to `AUTO` when at least one test case
  exists, otherwise `MANUAL`. Sending `gradingMode: "MANUAL"` explicitly keeps a test-backed question
  hand-marked.

## 3. How to run

### Option A: Docker

```bash
cp .env.example .env          # set JWT_SECRET to 32+ random characters
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:8080/api
- AI docs: http://localhost:8000/docs
- MySQL: `localhost:3307`
- Staff login: `lecturer@examguard.local` / `Lecturer123!`

### Option B: Local tools

```bash
# MySQL 8 on localhost:3307 with database/user examguard
cd ai
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m uvicorn app.main:app --port 8000

cd backend
mvn spring-boot:run            # Java 21 and Maven 3.9+

cd frontend
npm ci && cp .env.example .env.local && npm run dev

cd extension
npm ci && npm run build        # load extension/dist unpacked
```

Tests and evaluation:

```bash
cd backend   && mvn test
cd ai        && pytest -q && python -m app.evaluation.run_eval
cd frontend  && npm test && npm run typecheck && npm run build && npm run budget
cd extension && npm test && npm run typecheck && npm run build

# with docker compose up -d --wait:
cd frontend  && npm run test:e2e     # PLAYWRIGHT_BASE_URL defaults to http://localhost:5173
```

Training (optional learned fusion and authorship) and Kaggle:

```bash
cd ai
python -m app.training.export --out data
python -m app.training.train  --data data --out models
python -m app.training.authorship_export --out data-authorship --cohorts 200 --seed 7
python -m app.training.authorship_train  --data data-authorship --out models --seed 7
python -m app.training.authorship_eval   --data data-authorship/authorship.jsonl --model models/authorship.joblib
python -m app.training.kaggle_publish dataset --data data
python -m app.training.kaggle_publish models  --models models
python -m app.training.kaggle_publish notebook --dataset <owner>/examguard-synthetic-fusion-rows
```

Release and deployment:

```bash
git tag v1.0.0 && git push origin v1.0.0   # CD publishes GHCR images and the extension release
# on the VPS, with .env from deploy/.env.production.example:
./scripts/deploy.sh v1.0.0
```

The extension popup asks for the API base URL and the collector token from the student page. The
backend accepts `chrome-extension://*` origins because the manifest keeps `host_permissions` empty.

## 4. Repository map

```text
examguard/
  backend/
    src/main/java/com/examguard/
      config/        JWT (staff/attempt/account scopes), security, CORS
      domain/        20 entities + enums (questions, grading, integrity, authorship)
      repo/          Spring Data repositories
      dto/           HTTP and analysis wire shapes
      exam/          authoring, typed questions, permissions
      attempt/       join, autosave, submit, integrity signals, state machine
      grading/       auto-grading, manual queue, release
      report/        student/exam/admin reports, PDF and CSV
      dashboard/     role dashboards
      student/       student accounts and attempt linking
      analysis/      orchestration, payloads, findings, authorship policy
      review/        decisions and audit
      service/       access, auth, audit, analysis client, demo seeders
      web/           auth, health, error handling
    src/main/resources/db/migration/
      mysql/         V1 schema, V2 exam engine, V3 student roster
      postgresql/    V1 schema, V2 exam engine, V3 student roster
    src/main/resources/templates/reports/   Thymeleaf report templates
    src/test/        API, isolation, grading, strike, scope, report and workflow tests
  ai/
    app/features/    text, lexical, semantic, patterns, timing, coverage, activity, fusion, pair_rows
    app/authorship/  stylometry features and the capped classifier
    app/services/    pair/incident/authorship analysis and evidence modules, analyzer.py re-exports
    app/evaluation/  metrics, synthetic cohorts, ablation runner
    app/training/    cohort generators, export, trainers, eval gates, licensed-corpus adapter, Kaggle publish
    app/schemas.py   strict pair/incident/authorship contracts
    tests/           61 tests
  frontend/
    src/api/         typed client, staff queries, dashboards, student API
    src/components/  shell, chips, evidence panels, DataTable, charts, dialogs
    src/design/      tokens
    src/lib/         format, domains, autosave, time, tableState (URL-synced tables)
    src/features/    auth, exams (authoring/grading/settings/roster), findings,
                     dashboard (charts), audit, student
    src/test/        MSW fixtures, render helpers, axe suite
    e2e/             Playwright exam flow
  extension/
    src/             background, popup, queue, flush, domains, auth
    public/          manifest, popup page and styles
  kaggle/
    notebooks/       offline training notebook (dataset → models)
    README.md        CLI setup and publishing commands
  docs/              architecture, data model, API, evaluation, training, deployment, ethics
  deploy/            production env template
  scripts/           deploy.sh
  .github/           ci.yml (tests, Postgres, AI gates, bundle budget, compose + Playwright), cd.yml
  docker-compose.yml, docker-compose.prod.yml, render.yaml
  frontend/vercel.json
```

## 5. Conventions that must not drift

**Scores**

- Never call a score a probability or a risk of cheating in code, API names or UI copy.
- Keep the caps in `ai/app/features/fusion.py`: incomplete pair 35, low-coverage incident 45,
  unclassified-only incident 40.
- New evidence sources must be added to both the Java enum and the Python `Literal`, and to
  `docs/DATA_MODEL.md`.

**Isolation**

- Never add `events`, `activity`, `visits` or `rules` to `PairAnalysisRequest` or `PairCandidate`.
- Never add a second candidate to `IncidentCandidate`.
- Add a test whenever either wire model changes; the 422 tests in `ai/tests/test_api.py` are the
  pattern.
- An authorship request is one candidate's prose. Never add events, rules or a second candidate;
  `ai/tests/test_authorship.py` rejects duplicate candidate codes. Keep the 54 cap in both the AI
  service and `AuthorshipPolicy` so a version-skewed response cannot reach HIGH.

**Data**

- Domain-only activity. No URLs with paths, page titles, page text, keystrokes or screenshots.
- Store timestamps in UTC (`Instant` in Java, timezone-aware datetimes in Python).
- Persist `model_version` and `input_hash` for reproducibility.
- Audit every staff mutation and every decision.

**Scoring/evaluation honesty**

- Synthetic labels measure the simulator. Never present evaluation numbers as real-world cheating
  accuracy.
- Split by cohort and candidate, keep hard negatives, and state label leakage risks.
- Optional learned fusion is experimental; default remains transparent rules.
- Learned scores are overridden only before caps; `fuse_pair`/`fuse_incident` re-apply the 35/45/40
  caps after the model score. Tests in `ai/tests/test_fusion.py` pin this.

**Training**

- Feature order is a contract: `PAIR_FEATURE_ORDER` and `INCIDENT_FEATURE_ORDER` must match the
  vectors built by `ai/app/features/pair_rows.py` and the incident feature builder. The
  export/inference consistency test fails if they drift.
- Exported rows must be reproducible from the manifest seed, and every artifact keeps its
  `*.meta.json` metrics and `MODEL_CARD.md`. Never publish a model without them.
- Only cohorts with an allowed licence may enter `app.training.corpora`; the adapter rejects the
  rest. Never upload real candidate answers to Kaggle.

**Code**

- Java: DTO records, constructor injection, `@Transactional` on writes, no entities in controllers.
- Python: type hints, strict Pydantic models, pure feature functions, no I/O in features.
- TypeScript: strict mode, no `any` at API boundaries, hand-written records matching `ApiDtos`.
- Keep files near 250 lines and split before 400; one responsibility per file.

## 6. Definition of done

A deployment build is complete when all of the following are true:

1. `docker compose up --build` starts MySQL, AI, backend and frontend; health is `UP/UP/UP`.
2. A lecturer can log in, create an exam, open it, and see the demo exam.
3. A student can join with a code, answer, autosave, submit, and rejoin safely.
4. The extension connects to that attempt and sends only domain-level events.
5. Running analysis creates pair and incident findings with evidence and coverage warnings.
6. Pair findings never contain activity evidence; incident findings never contain another candidate.
7. A reviewer can record a decision with a rationale and see it in the audit trail.
8. All backend, AI, frontend and extension tests pass; CI is green.
9. `README.md` matches reality.

Status on 2026-11-07: 1, 2, 3, 5, 6, 7, 8 and 9 pass; CI is green on `main` and `develop` and CD
published `v0.1.0`. Point 4 passed as an origin-level API simulation, not in a packaged browser.
The remaining release step is the optional VPS deploy, which needs the `VPS_*` secrets and a GHCR
login on the host.

Phase 2 additions were re-verified end to end on 2026-11-08: the compose stack boots with the V3
migration on MySQL, PostgreSQL 16 validates the same schema, the three Playwright flows still pass,
and the roster, schedule, settings, preview, keyboard grading, charts and axe suite are covered by
the tests listed above.

Coding questions were verified on 2026-11-08: Flyway V4 applies on MySQL and PostgreSQL 16 with
`ddl-auto: validate`; 98 backend tests and 75 frontend tests pass, as do 19 runner tests, typecheck,
build and the 349.6 kB / 420 kB budget; the three Playwright flows pass against the rebuilt stack. In
a live browser walkthrough, DEMO-103 selected the seeded attempts (C201 23.33/30 with a 1-of-3 test
result on the JavaScript task, C202 10/30) and a fresh student account joined through the dashboard,
typed Python in the code editor, autosaved, submitted, and was auto-judged to 10.00 by the sandbox.
