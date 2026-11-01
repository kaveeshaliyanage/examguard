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

## 1. Current state (verified 2026-11-01)

| Area | State | Verification performed |
| --- | --- | --- |
| MySQL schema (Flyway V1) | Complete | `flyway migrate` + Hibernate `ddl-auto: validate` against MySQL 8.3 |
| JPA domain + repositories | Complete for all 14 tables | H2 context tests and live MySQL boot |
| Staff and attempt JWTs | Complete | `JwtServiceTest`, `AuthApiTest`, live login |
| Exam authoring, permissions, audit | Complete | `ExamApiTest`; live email-based grant/revoke |
| Public join, autosave, submit, events, heartbeat | Complete | `AttemptApiTest`; live join/save/dedupe/submit/rejoin |
| Analysis orchestration | Complete | `AnalysisFlowTest`, `AnalysisPayloadIsolationTest`; live run |
| Review workflow | Complete | `ReviewWorkflowTest`; live decision and audit |
| Python analysis service | Complete | 31 pytest tests; live pair and incident output; 100-candidate benchmark |
| React dashboard and student exam flow | Complete | 22 Vitest tests, `tsc --noEmit`, `vite build`; browser walkthrough |
| Chrome MV3 extension | Complete | 13 Vitest tests, typecheck, build; extension-origin API simulation |
| Docker Compose stack | MySQL + AI + backend + frontend defined | Not executed as a full stack in this environment |
| CI | `.github/workflows/ci.yml` for all four components | Not yet run on a remote runner |

Exact verified results:

```text
backend:  mvn test   -> 36 tests, 0 failures
ai:       pytest -q  -> 31 tests, 0 failures
frontend: npm test   -> 22 tests, 0 failures (tsc and vite build pass)
extension: npm test  -> 13 tests, 0 failures (tsc and vite build pass)
live:     /api/health -> {"status":"UP","database":"UP","analysis":"UP"}
live:     DEMO-101 run -> pair C001/C002, incidents C004 and C007, none for C008
```

The demo run produced `HIGH` review priority for C004, `LOW` for C001/C002 and C007, and a coverage
warning on C007. C008 and a candidate without the extension produced no incident: unknown activity is
not treated as clean.

## 2. Known gaps

- The Compose stack has not been executed end to end in this environment; services were verified
  individually. Run `docker compose up --build` once before claiming the container path works.
- The extension passed unit tests and its API calls were simulated with a `chrome-extension://`
  origin, but it was not loaded into a packaged Chrome profile in this environment.
- H2 tests use `ddl-auto: create-drop`; they do not validate the Flyway schema. The live MySQL run
  does validate it.
- Semantic embeddings are optional and disabled by default. Learned fusion is experimental.
- The synthetic evaluation measures the simulator. Never present its numbers as real-world accuracy.
- The demo seeder uses scripted content. It is not evidence about real people.

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
cd frontend  && npm test && npm run typecheck && npm run build
cd extension && npm test && npm run typecheck && npm run build
```

The extension popup asks for the API base URL and the collector token from the student page. The
backend accepts `chrome-extension://*` origins because the manifest keeps `host_permissions` empty.

## 4. Repository map

```text
examguard/
  backend/
    src/main/java/com/examguard/
      config/        JWT, security, CORS
      domain/        14 entities + enums
      repo/          Spring Data repositories
      dto/           HTTP and analysis wire shapes
      exam/          exam authoring, permissions
      attempt/       join, autosave, submit, ingestion
      analysis/      orchestration, payloads, findings
      review/        decisions and audit
      service/       access, auth, audit, demo seeders
      web/           auth, health, error handling
    src/main/resources/db/migration/V1__schema.sql
    src/test/        API, isolation, matcher and workflow tests
  ai/
    app/features/    text, lexical, semantic, patterns, timing, coverage, activity, fusion
    app/services/    pair/incident analysis and evidence modules, analyzer.py re-exports
    app/evaluation/  metrics, synthetic cohorts, ablation runner
    app/schemas.py   strict pair/incident contracts
    tests/           26 tests
  frontend/
    src/api/         typed client, staff queries, attempt API
    src/components/  shell, chips, evidence panels
    src/features/    auth, exams, findings, audit, student
    src/test/        MSW fixtures and render helpers
  extension/
    src/             background, popup, queue, flush, domains, auth
    public/          manifest, popup page and styles
  docs/              architecture, data model, API, evaluation, ethics, frontend spec
  .github/           CI workflow
  docker-compose.yml
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
