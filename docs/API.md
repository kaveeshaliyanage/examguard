# HTTP API

Base path `/api`. JSON only. Staff endpoints require `Authorization: Bearer <staff token>`.
Candidate endpoints require an attempt token from `/public/join`. Error shape:

```json
{ "timestamp": "2026-11-01T10:00:00Z", "status": 400, "error": "Bad Request",
  "message": "Human readable cause", "path": "/api/exams" }
```

Scores are review priority 0-100, bands `LOW | MEDIUM | HIGH | CRITICAL`.

## Public

### `GET /health`
```json
{ "status": "UP", "database": "UP", "analysis": "UP" }
```

### `POST /auth/login`
```json
{ "email": "lecturer@examguard.local", "password": "Lecturer123!" }
```
```json
{ "token": "<jwt>", "user": { "id": 2, "email": "lecturer@examguard.local",
  "displayName": "Demo Lecturer", "role": "LECTURER" } }
```
Staff only (`ADMIN`, `LECTURER`, `REVIEWER`). A student account is refused with 401
`Students sign in at the student portal`; students use `POST /student/auth/login`.

### `GET /auth/me`
Returns the same `user` object.

### `POST /public/join`
```json
{ "examCode": "DEMO-101", "candidateCode": "C001" }
```
```json
{
  "attemptId": 1,
  "sessionToken": "<attempt jwt>",
  "collectorToken": "<same token; convenience for the extension handshake>",
  "status": "IN_PROGRESS",
  "startedAt": "2026-11-01T09:00:00Z",
  "submittedAt": null,
  "exam": {
    "id": 1, "code": "DEMO-101", "title": "Demo Examination",
    "durationMinutes": 60,
    "questions": [ { "id": 1, "orderIndex": 1, "prompt": "...", "maxWords": 200 } ]
  },
  "answers": [ { "questionId": 1, "text": "...", "revisionNo": 3, "savedAt": "..." } ]
}
```

Join rules:

- `409` if the attempt is already submitted.
- `409` when starting a **new** attempt outside the schedule (`opensAt` future → "This exam opens at …",
  `closesAt` past → "This exam closed at …"). An attempt already `IN_PROGRESS` always resumes, even
  after `closesAt`, so saved answers are never stranded.
- When the exam has a non-empty roster, `403` unless the signed-in account's email is enrolled
  (case-insensitive). Guests (no account token) are refused with `403` and pointed at sign-in.
  Exams without a roster keep open join by code, and enrolment is only checked when a new attempt is
  created.

## Candidate (attempt token)

### `GET /attempts/{attemptId}`
Same shape as the join response minus the token.

### `PUT /attempts/{attemptId}/answers/{questionId}`
```json
{ "text": "Answer text", "clientSeq": 12 }
```
```json
{ "questionId": 1, "revisionNo": 4, "savedAt": "...", "wordCount": 41 }
```
Creates an immutable revision. `clientSeq` protects against out-of-order retries: a sequence lower
than the last accepted one is ignored and the current revision is returned.

### `POST /attempts/{attemptId}/submit`
```json
{ "late": false }
```
```json
{ "attemptId": 1, "status": "SUBMITTED", "submittedAt": "..." }
```

### `POST /attempts/{attemptId}/events`
```json
{
  "events": [
    { "clientEventId": "uuid", "eventType": "NAVIGATION", "domain": "chegg.com",
      "occurredAt": "2026-11-01T09:12:00Z", "tabId": 42, "metadata": {} },
    { "clientEventId": "uuid2", "eventType": "HEARTBEAT",
      "occurredAt": "2026-11-01T09:13:00Z", "metadata": {} }
  ]
}
```
```json
{ "accepted": 2, "duplicates": 0, "rejected": 0 }
```
Duplicates are detected by `(attemptId, clientEventId)`. Events outside the attempt window plus a
5-minute allowance are rejected. Domain is required for `NAVIGATION`.

### `POST /attempts/{attemptId}/heartbeat`
```json
{ "coverageStart": "...", "lastSeenAt": "...", "eventCount": 14,
  "domainsObserved": 3, "extensionConnected": true }
```

## Exams (staff)

### `GET /exams`
```json
[ { "id": 1, "code": "DEMO-101", "title": "Demo Examination", "status": "OPEN",
    "durationMinutes": 60, "attemptCount": 8, "submittedCount": 8,
    "findingCount": 0, "openFindingCount": 0, "lastAnalysisAt": null,
    "createdAt": "..." } ]
```

### `POST /exams`
```json
{
  "code": "MID-2026",
  "title": "Midterm",
  "description": "Short answers",
  "durationMinutes": 90,
  "allowExtension": true,
  "maxStrikes": 3,
  "instructions": "Close other applications.",
  "opensAt": "2026-11-12T09:00:00Z",
  "closesAt": "2026-11-12T11:00:00Z",
  "questions": [ { "prompt": "Explain ...", "maxWords": 250 } ],
  "resourceRules": [
    { "category": "PERMITTED", "domainPattern": "*.edu", "note": "University resources" },
    { "category": "PROHIBITED", "domainPattern": "chegg.com", "note": "Contract cheating site" }
  ]
}
```
Creates the exam in `DRAFT`, creates questions/rules and an `OWNER` permission for the creator.
`opensAt` and `closesAt` are optional; when both are present `opensAt` must be before `closesAt`.
`maxStrikes` defaults to 3 (range 1–10). Returns the exam detail.

### `GET /exams/{id}`
Detail: summary fields plus `description`, `allowExtension`, `maxStrikes`, `instructions`, `opensAt`,
`closesAt`, questions, resourceRules and permissions. Also carries the counts
`attemptCount`, `submittedCount`, `findingCount`, `openFindingCount`, `enrollmentCount`,
`releasedCount` and `awaitingReleaseCount`.

### `PATCH /exams/{id}`
Full replacement of the editable settings. Exam **owner only**; writes audit action
`EXAM_SETTINGS_UPDATED` with the changed field names.
```json
{
  "title": "Midterm",
  "description": "Short answers",
  "durationMinutes": 75,
  "allowExtension": false,
  "maxStrikes": 2,
  "instructions": "Close other applications.",
  "opensAt": null,
  "closesAt": null,
  "resourceRules": [ { "category": "PROHIBITED", "domainPattern": "chegg.com", "note": "Cheating site" } ]
}
```
`durationMinutes` is 5–600, `maxStrikes` 1–10, and a present pair must satisfy `opensAt < closesAt`
(otherwise `400`). `resourceRules` replaces the whole set. The **code is immutable** — it is the join
key. Editing stays allowed after candidates join; duration is evaluated when an attempt is submitted,
so it affects lateness, not already-started timers.

### `GET /exams/{id}/roster`
```json
[ { "id": 7, "email": "c001@students.example", "createdAt": "..." } ]
```
Owner, reviewer, viewer or admin. A non-empty roster restricts new joins to enrolled emails.

### `POST /exams/{id}/roster`
```json
{ "email": "c001@students.example" }
```
`201` with the entry. Emails are trimmed, lower-cased and unique per exam (`409` on duplicates);
invalid addresses are `400`. Owner only.

### `DELETE /exams/{id}/roster/{entryId}`
`204`. Owner only. Removing the last entry re-opens join by exam code alone.

### `PATCH /exams/{id}/status`
```json
{ "status": "OPEN" }
```
Allowed: `DRAFT`, `OPEN`, `CLOSED`, `ANALYSED` (the last is set by the analysis run).

### `GET /exams/{id}/attempts`
```json
[ { "attemptId": 1, "candidateCode": "C001", "status": "SUBMITTED",
    "startedAt": "...", "submittedAt": "...", "lastSeenAt": "...",
    "answerCount": 4, "eventCount": 12, "coveragePercent": 92.5,
    "coverageWarning": false, "lateSubmission": false } ]
```

### `POST /exams/{id}/analysis-runs`
Synchronously runs both analyses and persists findings. Returns the run resource even when it fails.
```json
{ "id": 3, "status": "COMPLETED", "modelVersion": "rules-1.0",
  "inputHash": "sha256...", "error": null, "findingsCreated": 6,
  "startedAt": "...", "finishedAt": "..." }
```
Only `SUBMITTED` attempts are analysed. Previous `OPEN` findings are marked `SUPERSEDED`.

### `GET /exams/{id}/analysis-runs`
List of run resources, newest first.

### `GET /exams/{id}/findings?type=CANDIDATE_PAIR&status=OPEN`
`type` and `status` optional. Sorted by `priorityScore` descending.
```json
[ { "id": 10, "type": "CANDIDATE_PAIR", "priorityScore": 81.2,
    "priorityBand": "CRITICAL", "status": "OPEN", "candidateA": "C001",
    "candidateB": "C002", "summary": "Strong lexical and rare-phrase overlap ...",
    "coverageWarning": false, "evidenceCount": 4, "createdAt": "..." } ]
```

### `GET /findings/{id}`
```json
{
  "id": 10, "type": "CANDIDATE_PAIR", "priorityScore": 81.2, "priorityBand": "CRITICAL",
  "status": "OPEN", "candidateA": "C001", "candidateB": "C002",
  "summary": "...", "coverageWarning": false, "createdAt": "...",
  "exam": { "id": 1, "code": "DEMO-101", "title": "Demo Examination" },
  "evidence": [ { "id": 31, "source": "PATTERN", "weight": 24.1,
    "questionId": 1, "detail": "4 rare shingles shared ...",
    "metadata": { "shingles": ["..."] }, "createdAt": "..." } ],
  "decisions": [ { "id": 2, "reviewerName": "Demo Lecturer",
    "outcome": "NEEDS_INFO", "rationale": "Ask both candidates ...", "createdAt": "..." } ],
  "pairContext": {
    "questions": [ { "id": 1, "prompt": "..." } ],
    "candidates": [
      { "candidateCode": "C001", "answers": [ { "questionId": 1, "text": "...",
        "revisions": [ { "revisionNo": 1, "text": "...", "savedAt": "..." } ] } ] },
      { "candidateCode": "C002", "answers": [ ... ] }
    ]
  },
  "incidentContext": null
}
```
For incidents, `pairContext` is null and `incidentContext` contains the candidate's observed events
with their rule classification.

### `POST /findings/{id}/decisions`
```json
{ "outcome": "CONFIRMED", "rationale": "Both answers contain the same invented example." }
```
Appends a decision, updates the finding status and writes an audit entry.

### `GET /exams/{id}/audit`
Newest first: `{ id, actor, action, entityType, entityId, detail, createdAt }`.

### `GET /exams/{id}/permissions` / `POST /exams/{id}/permissions`
Target an existing staff user by id or email:
```json
{ "userId": 3, "level": "REVIEWER" }
```
```json
{ "email": "reviewer@examguard.local", "level": "VIEWER" }
```
Admin or exam owner only. `DELETE /exams/{id}/permissions/{userId}` revokes.

## Dashboards (staff and students)

`GET /api/dashboard/student` (account token, `role=STUDENT`), `GET /api/dashboard/lecturer` and
`GET /api/dashboard/admin` (staff token).

### Student dashboard
```json
{ "profile": { ... }, "stats": { "totalAttempts": 3, "submitted": 2,
  "terminated": 0, "released": 1, "averagePercentage": 71.5, "strikesThisTerm": 1 },
  "upcoming": [
    { "examId": 9, "code": "NET-101", "title": "Networking Midterm",
      "opensAt": "2026-11-12T09:00:00Z", "closesAt": "2026-11-12T10:00:00Z",
      "openNow": false }
  ],
  "attempts": [ { ... } ] }
```
`upcoming` lists exams the signed-in student is **enrolled in**, that are `OPEN`, and that have no
attempt yet. `openNow` is computed from the schedule; the UI shows "Opens …" otherwise. Joined and
in-progress attempts appear in `attempts`, never twice.

### Lecturer dashboard
Existing fields plus:
```json
{ "distribution": [ { "label": "0-19", "count": 2 } ],
  "integrityTrend": [ { "date": "2026-10-26", "focusLossSignals": 0 } ],
  "bandMix": [ { "band": "HIGH", "count": 1 } ],
  "funnel": [ { "stage": "Attempts", "count": 12 }, { "stage": "Submitted", "count": 9 },
              { "stage": "Graded", "count": 6 }, { "stage": "Released", "count": 3 } ] }
```
`integrityTrend` covers the last 14 UTC days, zero-filled, counting `FOCUS_LOSS` signals for accessible
exams. `bandMix` aggregates the active (`OPEN`/`NEEDS_INFO`/`ESCALATED`) findings. `funnel` is derived
from submitted attempts (`gradedAt`, `releasedAt`).

## Admin

### `GET /admin/users`
### `POST /admin/users`
```json
{ "email": "new@example.org", "displayName": "New Reviewer",
  "password": "ChangeMe123!", "role": "REVIEWER" }
```
