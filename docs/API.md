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
Returns `409` if the attempt is already submitted.

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
  "questions": [ { "prompt": "Explain ...", "maxWords": 250 } ],
  "resourceRules": [
    { "category": "PERMITTED", "domainPattern": "*.edu", "note": "University resources" },
    { "category": "PROHIBITED", "domainPattern": "chegg.com", "note": "Contract cheating site" }
  ]
}
```
Creates the exam in `DRAFT`, creates questions/rules and an `OWNER` permission for the creator.
Returns the exam detail.

### `GET /exams/{id}`
Detail: summary fields plus description, allowExtension, questions, resourceRules, permissions.

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

## Admin

### `GET /admin/users`
### `POST /admin/users`
```json
{ "email": "new@example.org", "displayName": "New Reviewer",
  "password": "ChangeMe123!", "role": "REVIEWER" }
```
