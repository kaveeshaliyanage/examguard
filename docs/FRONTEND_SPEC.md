# Frontend and extension build specification

Build this after the backend endpoints in `docs/API.md` exist. Stack required by the project:
**React 18, TypeScript (strict), Vite, MUI**. Recommended companions: React Router, TanStack Query,
Vitest, React Testing Library, MSW. Do not add a state framework for server data that TanStack Query
already owns.

The frontend has three jobs: let staff review findings, let students take an exam, and let the
extension contribute **domain-only** observations. It must never imply that a score proves cheating.

## 1. Non-negotiable UI rules

1. Always label the score **"Review priority"** and show the band. Never use "risk", "probability",
   "cheat score" or a percentage-like gauge that implies likelihood.
2. When `coverageWarning` is true, render a persistent warning next to the score:
   *"Monitoring data is incomplete. Missing observations are unknown, not clean."*
3. Pair and incident findings are different objects. Use different icons and tabs, and never show
   activity evidence inside a pair view.
4. A finding is not a verdict. The decision dialog must say that a human decision is required and
   must require a rationale.
5. Never display candidate emails, tokens or raw URLs. Candidate codes only; domains only.

## 2. Routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/login` | Staff | Email/password sign-in |
| `/exams` | Staff | Exam list with status, attempts, open findings |
| `/exams/new` | Lecturer | Create exam, questions, resource rules |
| `/exams/:id` | Staff | Overview, attempts, runs, findings, permissions |
| `/exams/:id/audit` | Staff | Audit trail |
| `/findings/:id` | Reviewer | Evidence detail and decision |
| `/join` | Student | Enter exam code + candidate code |
| `/attempt/:attemptId` | Student | Answer questions, autosave, timer, submit |
| `/attempt/:attemptId/submitted` | Student | Receipt and safe close |

Unknown routes redirect to `/exams` when signed in, otherwise `/login`. Staff routes require a staff
token; student routes require an attempt token whose `attemptId` matches the URL. On 401, clear the
token and redirect to the matching sign-in page.

## 3. App shell and auth

- `AuthProvider` stores `{ token, user }` in `sessionStorage` under `examguard.staff`. Use
  `sessionStorage`, not `localStorage`, so closing the browser ends the session. (A production
  hardening step would move to httpOnly cookies; note it in the README, do not silently pretend.)
- API wrapper adds `Authorization: Bearer <token>`, parses the documented error shape, and throws a
  typed `ApiError { status, message, path }`. Show `message` in a Snackbar for 4xx; show a generic
  retry message for 5xx.
- Top bar: product name, exam breadcrumb when relevant, user menu with name, role and sign out.
  Low-key footer: "Review priority is not a finding of misconduct."
- Loading states use MUI Skeleton, not spinners on full pages. Empty states explain the next action.

## 4. Staff screens

### 4.1 Exam list `/exams`

Call `GET /api/exams`. Columns: code, title, status chip, attempts, submitted, open findings, last
analysis. Sort by created date descending. Actions: open, create exam (lecturer/admin only).

Status chips: DRAFT neutral, OPEN success, CLOSED warning, ANALYSED info. Finding count links to the
findings tab with `status=OPEN`.

### 4.2 Create exam `/exams/new`

Form fields: code, title, description, durationMinutes, allowExtension, questions (prompt, maxWords,
add/remove/reorder), resource rules (category, domainPattern, note, add/remove).

Client validation: code required/unique-looking, duration 5–480, at least one question, no empty
prompt. Show a preview of how a domain rule matches: exact, `*.suffix`, or `re:`. Do not validate the
regex server-side only; catch invalid `re:` patterns in the form.

Submit `POST /api/exams`; on success go to `/exams/:id` with a toast. Creating an exam never opens it
automatically.

### 4.3 Exam detail `/exams/:id`

Header: title, code, status, duration, permission badge, actions (open/close, run analysis).
Tabs:

1. **Overview** — description, questions, rules, extension allowance, latest run summary.
2. **Attempts** — `GET /exams/:id/attempts`; candidate code, status, submitted time, answer count,
   event count, coverage percent, coverage warning, late flag. Coverage < 60% shows a warning chip,
   not a red "cheating" chip.
3. **Findings** — `GET /exams/:id/findings`; filter by type and status. Two sub-tabs: **Pairs** and
   **Incidents**. Both sorted by priority descending. Row: band chip, score, candidates, summary,
   coverage icon, evidence count, status. Click opens `/findings/:id`.
4. **Runs** — `GET /exams/:id/analysis-runs`; status, model version, findings created, timings,
   error. "Run analysis" is disabled while an exam has no submitted attempts or a run is in flight.
5. **Settings** — status transitions, permissions (owner/admin), audit link.

Run analysis: `POST /exams/:id/analysis-runs`. Show a blocking progress panel because the endpoint is
synchronous; on failure show the returned run error and keep previous findings visible.

### 4.4 Finding detail `/findings/:id`

Two-column layout on desktop, stacked on mobile:

- **Left: evidence.** Band and score header; coverage warning if present; evidence cards sorted by
  weight. Card types:
  - `SIMILARITY`: per-question cosine, cohort mean and normalized excess; render a small table.
  - `PATTERN`: shared shingles/tokens/spelling variants as chips.
  - `TIMING`: aligned revisions with leader/follower, delta seconds and similarity; copy must say
    that direction alone is not proof.
  - `ACTIVITY`: prohibited and unclassified domains with timestamps and rule note; permitted
    domains in a separate muted section.
  - `ANSWER_CHANGE`: revision, domain, delay and character delta.
  - `COVERAGE`: coverage percent and the unknown-not-clean message.
- **Right: context.**
  - Pair: side-by-side answers per question with revisions. Highlight shared n-grams returned in
    evidence metadata. Include a "no activity data is used in pair findings" note.
  - Incident: vertical timeline of candidate events with category colors (prohibited = error,
    unclassified = warning, permitted = neutral/success, heartbeats collapsed).

Bottom: decision panel. Outcome select (`CONFIRMED`, `DISMISSED`, `NEEDS_INFO`, `ESCALATED`) and a
required rationale (min 10 chars). Submit `POST /findings/:id/decisions`; refresh finding and audit.
History shows reviewer name, outcome, rationale and time. Do not hide previous decisions.

Band colors: LOW secondary/neutral, MEDIUM warning, HIGH error, CRITICAL deep error with a distinct
icon. Never color an entire page red; keep the evidence readable.

### 4.5 Audit `/exams/:id/audit`

`GET /exams/:id/audit`; table with actor, action, entity, time and expandable JSON detail. Read-only.

## 5. Student flow

### 5.1 Join `/join`

Fields: exam code (prefill from `VITE_DEFAULT_EXAM_CODE`), candidate code. Submit
`POST /api/public/join`. Store the attempt token in `sessionStorage` under
`examguard.attempt.<attemptId>` and navigate to `/attempt/:attemptId`. Handle 409 with a clear
"already submitted" screen. Never store the token in a URL.

### 5.2 Exam `/attempt/:attemptId`

- Header: exam title, candidate code, countdown, save indicator, extension status.
- Countdown uses `startedAt + durationMinutes` with a server-time offset captured from the join
  response. Warn at 5 minutes. At zero, submit automatically once; show a blocking receipt.
- Questions are a vertical list or a step navigation on mobile. Autosize textarea, word counter from
  `maxWords`, no rich text.
- Autosave: debounce 800 ms, flush on blur, tab hide and submit. Each question keeps a monotonic
  `clientSeq`; on success update `revisionNo` and show "Saved HH:mm". On failure keep the text,
  show "Not saved — retrying" and retry with backoff. Never discard local text.
- Submit: confirmation dialog listing unanswered questions. `POST .../submit` is idempotent. On
  success clear the draft and show the receipt. If the request fails, keep the attempt open.
- Rejoin calls `GET /attempts/:attemptId`, restoring answers and showing a "resumed" toast.

### 5.3 Extension connection panel

The attempt page shows **Connect monitoring extension** with:

- A short explanation: only domain names and navigation times are collected; page content,
  keystrokes and screenshots are never collected.
- A "Copy connection token" button using the `collectorToken` from join.
- The extension ID (from `VITE_EXTENSION_ID` if provided) and a link to install/load instructions.
- Current status from `GET /attempts/:attemptId` (`extensionConnected`, last heartbeat).

The extension popup accepts API base URL + collector token. No page-to-extension messaging is
required; this keeps the extension ID out of the security boundary and works with an unpacked build.

## 6. Chrome extension (MV3)

### 6.1 Scope

Capture only:

- `EXTENSION_CONNECTED` / `EXTENSION_DISCONNECTED`
- `NAVIGATION` with normalized `domain` only
- `HEARTBEAT`
- `TAB_HIDDEN` / `TAB_VISIBLE`

Never capture page title, path, query, content, keystrokes, clipboard, screenshots or audio.
`metadata` stays empty or contains only booleans needed for debugging.

### 6.2 Manifest

```json
{
  "manifest_version": 3,
  "name": "ExamGuard Monitoring",
  "version": "0.1.0",
  "description": "Sends domain-level exam activity to the candidate's own attempt.",
  "permissions": ["tabs", "storage", "alarms"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html" },
  "host_permissions": []
}
```

Use `chrome.tabs.onUpdated` with `changeInfo.url`; parse with `new URL`, keep only
`hostname.toLowerCase()` and strip a leading `www.`. Ignore `chrome://`, `edge://`, `about:`,
`file://`, extension pages and empty URLs. Do not request `<all_urls>` or scripting permissions.

### 6.3 Behaviour

- Popup validates API base and token, stores them in `chrome.storage.local` under
  `examguard.connection`, then sends `EXTENSION_CONNECTED`.
- Background alarms: flush every 30 s, heartbeat every 60 s, retry with exponential backoff.
- Queue events in `chrome.storage.local` under `examguard.queue`; cap at 500 and drop oldest with a
  counter. Flush in batches of 20 with `POST /attempts/{id}/events`.
- Deduplicate with a UUID `clientEventId`; the server also deduplicates.
- On token 401, stop flushing and mark the popup "Reconnect required". Keep the queue.
- On submit, the app may call the extension through no API; the user simply closes the exam. The
  server treats missing heartbeats as unknown coverage, not clean behavior.
- Do not attempt to detect "cheating" or block navigation. The extension is an observer only.

### 6.4 Extension acceptance

- Loading `extension/dist` unpacked starts a heartbeat and sends only the allowed event types.
- Visiting a page sends one `NAVIGATION` with a hostname and no path; repeating the same domain is
  either deduplicated or rate-limited.
- `chrome.storage.local` contains no answer text.
- Killing the service worker loses no queued events.
- `npm run typecheck` and unit tests for URL normalization and queue flushing pass.

## 7. Suggested file structure

```text
frontend/src/
  api/            client.ts, types.ts, queries.ts
  auth/           AuthProvider.tsx, RequireStaff.tsx, RequireAttempt.tsx
  components/     AppShell.tsx, BandChip.tsx, CoverageBanner.tsx, EmptyState.tsx,
                  EvidenceCard.tsx, AnswerComparison.tsx, EventTimeline.tsx
  features/
    exams/        ExamListPage.tsx, CreateExamPage.tsx, ExamDetailPage.tsx
    findings/     FindingDetailPage.tsx, DecisionPanel.tsx
    student/      JoinPage.tsx, AttemptPage.tsx, SubmittedPage.tsx, ExtensionPanel.tsx
  lib/            format.ts, domains.ts, autosave.ts, time.ts
  theme.ts
  router.tsx
  main.tsx

extension/src/
  background.ts   popup.ts   api.ts   queue.ts   domains.ts
```

## 8. Tests (Vitest + React Testing Library)

Minimum acceptance tests:

1. `BandChip` renders LOW/MEDIUM/HIGH/CRITICAL and never renders a percentage.
2. Finding detail shows the coverage warning when `coverageWarning` is true and hides it otherwise.
3. Pair tab never renders activity evidence; incident tab never renders a second candidate.
4. Decision submit is disabled until the rationale has at least 10 characters.
5. Autosave debounces, sends increasing `clientSeq`, and keeps text after a failed request.
6. Countdown uses the server offset and triggers exactly one auto-submit at zero.
7. Join handles 409 and 401 with the documented screens.
8. Domain normalization strips scheme, path, query, port and `www.`.
9. MSW handlers enforce the documented API shapes; a wrong shape fails the test.

## 9. Definition of done for the UI

- The demo flow in `README.md` works with no console errors.
- A reviewer can go from exam list to finding to decision in under a minute.
- Keyboard navigation works on the exam, decision dialog and finding tabs; focus is trapped in
  dialogs; color contrast passes WCAG AA.
- Every score is labelled as review priority; every capped finding shows why.
- No screen claims that the system has detected cheating.
