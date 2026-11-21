# Data model

MySQL 8, schema managed by Flyway (`backend/src/main/resources/db/migration/mysql/`); the
PostgreSQL mirror lives in `.../postgresql/`. All timestamps are UTC `datetime(6)`. Candidate
identity is a code, not a name; student accounts are optional and only link attempts to an email.

## Tables

### `app_user`
| Column | Notes |
| --- | --- |
| id | bigint PK |
| email | unique, login identity |
| password_hash | BCrypt |
| display_name | shown in audit history |
| role | `ADMIN`, `LECTURER`, `REVIEWER` |
| enabled | boolean |
| created_at | |

A candidate is **not** an `app_user`; they only hold an attempt token.

### `exam`
| Column | Notes |
| --- | --- |
| id | PK |
| code | unique, shared with candidates |
| title, description | |
| duration_minutes | |
| status | `DRAFT`, `OPEN`, `CLOSED`, `ANALYSED` |
| created_by | FK app_user |
| opens_at, closes_at | nullable |
| allow_extension | boolean |
| requires_pin | boolean, default false; gates new joins once a PIN is issued |
| access_pin_hash | BCrypt hash of the 6-digit PIN, nullable; plaintext is never stored |
| access_pin_issued_at, access_pin_sent_at | issue and last-email timestamps |
| requires_preflight | boolean, default true; supervised pre-exam window |
| created_at | |

### `exam_enrollment`
| Column | Notes |
| --- | --- |
| id | PK |
| exam_id | FK exam |
| email | trimmed and lower-cased |
| created_at | |
| unique | (exam_id, email) |

A non-empty roster limits new joins to these addresses and is the PIN email distribution list.

### `exam_permission`
| Column | Notes |
| --- | --- |
| id | PK |
| exam_id | FK exam |
| user_id | FK app_user |
| level | `OWNER`, `REVIEWER`, `VIEWER` |
| unique | (exam_id, user_id) |

### `question`
| Column | Notes |
| --- | --- |
| id | PK |
| exam_id | FK exam |
| order_index | unique per exam |
| prompt | |
| max_words | |

### `resource_rule`
| Column | Notes |
| --- | --- |
| id | PK |
| exam_id | FK exam |
| category | `PERMITTED`, `PROHIBITED`, `UNCLASSIFIED` |
| domain_pattern | exact, `*.suffix`, or `re:<regex>` |
| note | lecturer-facing explanation |

### `candidate`
| Column | Notes |
| --- | --- |
| id | PK |
| exam_id | FK exam |
| code | unique per exam |
| display_label | optional, still pseudonymous |
| unique | (exam_id, code) |

### `attempt`
| Column | Notes |
| --- | --- |
| id | PK |
| exam_id, candidate_id | unique pair; one attempt per candidate |
| student_user_id | nullable FK `app_user`; links a resume to the signed-in student account |
| status | `IN_PROGRESS`, `SUBMITTED`, `EXPIRED`, `TERMINATED` |
| started_at | join time; rewritten when the preflight is confirmed |
| active_started_at | when the exam clock starts; nullable until the preflight is confirmed |
| preflight_completed_at | nullable; set with `active_started_at` |
| preflight_json | the 8 check booleans plus client diagnostics |
| profile_photo | data-URL identity photo, nullable |
| photo_taken_at | nullable |
| auto_submitted | true when the deadline sweep stopped the attempt |
| submitted_at, last_seen_at | server timestamps |
| extension_connected | set by `EXTENSION_CONNECTED` event |
| late_submission | boolean |
| created_at | |

The deadline is `active_started_at + duration_minutes`; the expiry sweep and the save path read the
same clock. Index `(status, active_started_at)` supports the sweep.

### `answer_revision`
Immutable. The current answer is the highest revision number for an attempt/question.

| Column | Notes |
| --- | --- |
| id | PK |
| attempt_id, question_id | FK |
| revision_no | unique per attempt/question |
| text | answer body (text) |
| selected_options | JSON text, for future MCQ snapshots |
| client_seq | client-provided monotonic sequence |
| saved_at | server timestamp |

### `activity_event`
| Column | Notes |
| --- | --- |
| id | PK |
| attempt_id | FK |
| client_event_id | unique per attempt; idempotency key |
| event_type | `NAVIGATION`, `HEARTBEAT`, `TAB_HIDDEN`, `TAB_VISIBLE`, `EXTENSION_CONNECTED`, `EXTENSION_DISCONNECTED` |
| domain | registrable domain only; null for non-navigation events |
| occurred_at | client event time |
| received_at | server time |
| tab_id | optional |
| metadata_json | small, no page content |
| index | (attempt_id, occurred_at) |

No URL paths, page titles, keystrokes or screenshots are stored.

### `analysis_run`
| Column | Notes |
| --- | --- |
| id | PK |
| exam_id | FK |
| status | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED` |
| model_version | returned by the AI service |
| input_hash | SHA-256 of both payloads, for reproducibility |
| error | nullable |
| created_by | FK app_user |
| started_at, finished_at | |

### `finding`
One table for both outputs; `type` and nullability encode the difference.

| Column | Notes |
| --- | --- |
| id | PK |
| exam_id, analysis_run_id | FK |
| type | `CANDIDATE_INCIDENT`, `CANDIDATE_PAIR` |
| candidate_a_id | FK candidate (always set) |
| candidate_b_id | FK candidate (pair only, else null) |
| question_id | optional focal question |
| priority_score | double 0-100, review priority |
| priority_band | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| coverage_warning | boolean |
| status | `OPEN`, `CONFIRMED`, `DISMISSED`, `NEEDS_INFO`, `SUPERSEDED` |
| summary | short human-readable explanation |
| created_at | |

Invariant: `(type = 'CANDIDATE_PAIR') = (candidate_b_id IS NOT NULL)`.

### `evidence_item`
| Column | Notes |
| --- | --- |
| id | PK |
| finding_id | FK, cascade delete |
| source | `SIMILARITY`, `PATTERN`, `TIMING`, `ACTIVITY`, `ANSWER_CHANGE`, `COVERAGE` |
| weight | contribution to the priority score, 0-100 |
| question_id | optional |
| detail | human-readable explanation |
| metadata_json | raw feature values for audit |
| created_at | |

### `review_decision`
Append-only. A finding's status is derived from the latest decision, while history is retained.

| Column | Notes |
| --- | --- |
| id | PK |
| finding_id | FK |
| reviewer_id | FK app_user |
| outcome | `CONFIRMED`, `DISMISSED`, `NEEDS_INFO`, `ESCALATED` |
| rationale | required free text |
| created_at | |

### `audit_log`
| Column | Notes |
| --- | --- |
| id | PK |
| actor_user_id | FK app_user, nullable for system |
| action | e.g. `FINDING_DECISION`, `ANALYSIS_STARTED`, `EXAM_CREATED` |
| entity_type, entity_id | |
| detail_json | |
| created_at | |

## Python-side payload contracts

The analysis service receives **two distinct schemas**:

- `PairAnalysisRequest`: exam id, questions, candidates with answers and revisions. No events, no
  domains, no coverage fields.
- `IncidentAnalysisRequest`: one candidate's answers/revisions, activity events, monitoring window,
  exam duration and resource rules. No other candidate's answers.

Pydantic models use `extra="forbid"`, so accidental cross-contamination fails loudly.

## Reproducibility

An analysis run stores `model_version` and `input_hash`. Evidence stores raw feature values in
`metadata_json`. Re-running the same input against the same model version should produce the same
findings; the hash makes that checkable.
