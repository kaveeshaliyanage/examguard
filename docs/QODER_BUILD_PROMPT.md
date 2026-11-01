# Paste this into Qoder

You are continuing an existing project. Do not redesign it from scratch and do not replace its
contracts. Work in the repository root that contains `backend/`, `ai/`, `docs/`, `frontend/` and
`extension/`.

## Read before writing code

Read these in order and treat them as the source of truth:

1. `docs/HANDOFF.md` — current state, build order, acceptance criteria.
2. `docs/ARCHITECTURE.md` — components, isolation rule, scoring.
3. `docs/DATA_MODEL.md` — tables, invariants, wire contracts.
4. `docs/API.md` — every HTTP shape you must implement.
5. `docs/FRONTEND_SPEC.md` — routes, screens, autosave, extension protocol.
6. `docs/ETHICS_AND_LIMITS.md` — hard privacy and usage limits.
7. Existing code in `backend/src/main/java` and `ai/app` before changing either.

## The project in one paragraph

ExamGuard AI reviews short-answer online exams with multiple evidence sources. It produces
candidate-level **incidents** (one candidate's resource visits, coverage, answer changes near a
flagged visit) and candidate-pair **findings** (similarity, distinctive shared wording, revision
timing). The two pipelines are structurally isolated: a website visit by one candidate must never
raise suspicion against everyone whose answers resemble theirs. A `priorityScore` is **review
priority**, never a probability that a student cheated. The Java backend owns auth, exam data and
review workflow. The Python FastAPI service owns features and scoring. MySQL stores everything.

## What already works — do not break it

- `ai/`: 26 pytest tests pass; pair and incident analyzers, feature modules, synthetic evaluation.
- `backend/`: compiles on Java 21, 5 tests pass; Flyway schema validated against MySQL 8.4; login and
  health verified; demo seeder verified.
- Strict isolation exists in `AnalysisDtos.java` and `ai/app/schemas.py` (`extra="forbid"`).
- `docker-compose.yml` and `backend/Dockerfile` exist. Run them once and fix what is actually broken.

Run these before changing anything to establish a baseline:

```bash
cd backend && mvn test
cd ../ai && pytest -q
cd ../ai && python -m app.evaluation.run_eval
```

## What is missing — implement in order

1. **Exam authoring and permissions.** `ExamService`, exam controllers, permission checks, status
   transitions, audit rows. Use `docs/API.md`.
2. **Public join + candidate attempt.** Join, attempt read, autosave with immutable revisions and
   `clientSeq`, submit, event ingestion, heartbeat. Attempt token security. Events are domain-only.
3. **Analysis orchestration.** `AnalysisService`, analysis runs, two isolated payloads, persist
   findings/evidence, supersede old findings, handle AI failure honestly.
4. **Review workflow.** Finding detail, decision append with rationale, audit, permission checks.
5. **Frontend.** Follow `docs/FRONTEND_SPEC.md` exactly. React 18 + TS strict + Vite + MUI.
6. **Chrome MV3 extension.** Domain-only capture, batching, heartbeat, popup connection. No page
   content, keystrokes or screenshots.
7. **Compose + CI + README.** Full stack runs; tests run in CI; README matches reality.

After each step, run the relevant tests and report the result. Stop and explain a failure instead of
weakening a test or widening the change.

## Hard constraints

- Do not add activity events, rules or visits to pair payloads/models. Do not add a second candidate
  to incident payloads. Add a rejection test for any change to these models.
- Do not call the score a probability, risk of cheating, or percentage likelihood. UI copy must say
  "Review priority" and show coverage warnings.
- Keep these caps: incomplete pair 35; incident coverage < 60% 45; unclassified-only incident 40.
- No page URLs with paths, page text, keystrokes, screenshots or webcam capture anywhere.
- Every staff mutation and every review decision writes an audit row.
- Timestamps UTC. Store `model_version` and `input_hash` with a run.
- Never present synthetic evaluation numbers as real-world accuracy.
- Do not commit secrets. Use environment variables; `JWT_SECRET` must be at least 32 bytes.
- Do not use `ddl-auto: update` in production. Flyway is the schema owner.

## Verification commands

```bash
# backend
cd backend && mvn test && mvn -DskipTests package

# AI
cd ai && pytest -q && python -m app.evaluation.run_eval

# frontend (once created)
cd frontend && npm ci && npm run build && npm test -- --run

# extension (once created)
cd extension && npm ci && npm run typecheck && npm test -- --run

# stack
cp .env.example .env
docker compose up --build
curl http://localhost:8080/api/health
```

Expected after a complete build:

- Health returns `{"status":"UP","database":"UP","analysis":"UP"}`.
- Seeded login works; `DEMO-101` shows 8 submitted attempts.
- Analysis creates the scripted pair `C001/C002` and incidents for `C004` and `C007`; no incident for
  `C008` (no monitoring), and a permitted-only or unclassified-only candidate is not treated as
  prohibited.
- A pair finding contains no activity evidence; an incident finding contains no other candidate.
- A decision with a rationale appears in the audit trail.

## Reporting format for each step

Reply with: what changed (files), what you ran, the exact result, any skipped verification, and the
next step. Do not report a step as done if its tests were not run.
