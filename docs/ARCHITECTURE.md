# Architecture

## Components

```text
+-------------------+        +----------------------+        +-------------------+
| React frontend    |  /api  | Spring Boot backend  |  HTTP  | FastAPI analysis  |
| student + staff   | -----> | auth, exams, attempts| -----> | features + fusion |
+-------------------+        | ingestion, review    |        +-------------------+
        ^                    +----------+-----------+                 |
        |                               |                             |
        | chrome.runtime                | JPA / Flyway                | stateless
+-------------------+                   v                             v
| MV3 extension     |              +---------+                  feature JSON
| domain events     | -----------> | MySQL 8 |
+-------------------+   /api       +---------+
```

- **Backend** is the only writer to MySQL. It owns exam sessions, revisions, event ingestion,
  permissions, analysis orchestration and the audit trail.
- **Analysis service** is stateless. It receives two different payloads and returns findings with
  evidence. It stores no student data.
- **Frontend** has one role-aware SPA: `/join` and `/exam/:id` for candidates, everything else for
  staff.
- **Extension** observes active domains and navigation while an attempt is connected. It sends
  events to the backend with an attempt-scoped token.

## The isolation rule

The requirement "a visit by one candidate must not increase suspicion against everyone whose
answers resemble theirs" is enforced structurally:

1. `PairAnalysisRequest` has no event, domain or activity field.
2. `IncidentAnalysisRequest` has no other candidate's answers.
3. The orchestrator builds those payloads from separate queries.
4. The dashboard renders incidents and pairs in separate tabs and never combines their scores.
5. Pair fusion weights contain no activity component. A test asserts the pair schema rejects
   unknown activity fields.

This is deliberately stronger than a convention in the scoring code.

## Data flow

1. Lecturer creates an exam with questions and resource rules. Creator receives `OWNER` permission.
2. Candidate joins with exam code + candidate code. Backend creates or resumes an attempt and issues
   an attempt-scoped JWT (also used as the extension collector token).
3. Autosave writes an immutable `answer_revision` with a server timestamp, revision number and
   client sequence. The current answer is a view over the latest revision.
4. Extension posts domain/navigation/heartbeat events. Ingestion is idempotent on
   `(attempt_id, client_event_id)` and rejects events outside the attempt's monitoring window.
5. Submission closes the attempt and records `submitted_at`.
6. Lecturer triggers an analysis run. Backend loads all submitted attempts once, builds two payloads,
   calls `/analyze/pairs` and `/analyze/incidents`, and persists findings + evidence items in one
   transaction per result. A run records its input hash and model version.
7. Lecturer reviews findings, records decisions and rationale. Every decision writes an audit entry.
8. Re-running analysis supersedes previous `OPEN` findings for that exam but never deletes review
   decisions: old findings are marked `SUPERSEDED`.

## Scoring model

`priorityScore` is a transparent weighted combination of normalized evidence contributions. It is a
ranking device between 0 and 100. Bands:

| Band | Range | Meaning |
| --- | --- | --- |
| LOW | 0-29 | context only; unlikely to need review |
| MEDIUM | 30-54 | worth a look when time allows |
| HIGH | 55-74 | review before lower-priority cases |
| CRITICAL | 75-100 | review first; evidence still requires human judgement |

Coverage caps prevent missing observations from looking like clean behaviour:

- Pair: fewer than two substantive questions answered -> cap 35 and a coverage warning.
- Incident: monitoring coverage below 60% -> cap 45; no extension observations -> no incident finding,
  only an attempt-level coverage warning.

The optional logistic-regression fusion is trained offline and loaded from `MODEL_DIR`. Its output is
mapped to the same 0-100 priority scale; it is not presented as a calibrated probability. Rules remain
the default and the fallback.

## Pair evidence

| Source | Feature | Weight (with semantic) |
| --- | --- | --- |
| SIMILARITY | per-question TF-IDF cosine, normalized by cohort baseline | 0.28 |
| SIMILARITY | SBERT cosine, normalized by cohort baseline (optional) | 0.22 |
| PATTERN | containment of rare 3-6 word shingles | 0.28 |
| PATTERN | rare overlap across different questions | 0.10 |
| TIMING | aligned content-changing revisions within 120 s | 0.12 |

When semantic embeddings are unavailable the weights renormalize (lexical 0.36, pattern 0.36,
cross-question 0.13, timing 0.15). Every contribution appears as an evidence item with the raw
feature values so a reviewer can audit the arithmetic.

## Incident evidence

| Source | Feature | Weight |
| --- | --- | --- |
| ACTIVITY | prohibited-domain visits, saturating over visits | 0.45 |
| ANSWER_CHANGE | answer revisions within 120 s after a flagged visit | 0.25 |
| PATTERN | repeat access across distinct prohibited domains | 0.15 |
| ACTIVITY | unclassified-domain visits (never treated as prohibited) | 0.15 |

Rules are matched case-insensitively: exact domain, `*.suffix` wildcard, or `re:<regex>`. Unknown
domains are `UNCLASSIFIED`, not prohibited. A visit is a policy deviation to review, not a finding of
misconduct.

## Security model

- Staff JWT (HS256): subject = user id, role claim, 8 h default. Attempt JWT: subject = attempt id,
  `STUDENT` role, 6 h default. Both signed with `JWT_SECRET`.
- Role checks: `ADMIN` all; `REVIEWER` read/review all exams; `LECTURER` only exams with an explicit
  permission. Attempt endpoints accept the attempt's own token or staff with exam access.
- Passwords: BCrypt. No password is ever returned by an endpoint.
- Ingestion: attempt token required; event timestamps must fall inside the attempt window (with a
  small clock-skew allowance); client event ids make retries idempotent.
- Analysis service has no public exposure in Compose; the backend calls it over the internal network.
- CORS is restricted by `CORS_ALLOWED_ORIGINS`.

## Failure handling

- AI service unavailable: the analysis run is marked `FAILED` with the error; no partial findings are
  presented as complete. The previous completed run remains visible.
- Event batch failure: the extension keeps events in a bounded local queue and retries; duplicates are
  rejected by `client_event_id`.
- Autosave failure: the student UI keeps the draft locally and retries; the server revision number is
  authoritative and conflicts are resolved by accepting a new revision with the next sequence.
- Timer: server-authoritative. Submission after the deadline is accepted but flagged `late=true` in
  attempt metadata rather than silently discarded.
