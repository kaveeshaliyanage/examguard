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
5. Never display candidate emails, tokens or raw URLs inside findings and candidate-facing screens.
   Candidate codes only; domains only. The one exception is the staff-only exam roster, where the
   lecturer manages the enrolled addresses.

## 2. Routes

| Route | Audience | Purpose |
| --- | --- | --- |
| `/login` | Staff | Email/password sign-in |
| `/dashboard` | Lecturer/admin | Lecturer dashboard: exam health, charts, grading queue |
| `/admin` | Admin | Users, runs, audit, AI health |
| `/exams` | Staff | Exam list with status, attempts, open findings |
| `/exams/new` | Lecturer | Create exam, questions, resource rules, schedule |
| `/exams/:id` | Staff | Overview, attempts, runs, findings, grading, settings |
| `/exams/:id/audit` | Staff | Audit trail |
| `/findings/:id` | Reviewer | Evidence detail and decision |
| `/join` | Student | Enter exam code + candidate code |
| `/student` | Student account | Signed-in student dashboard: stats, upcoming exams, attempts |
| `/attempt/:attemptId` | Student | Answer questions, autosave, timer, submit |
| `/attempt/:attemptId/instructions` | Student | Pre-exam instructions and extension setup |
| `/attempt/:attemptId/submitted` | Student | Receipt and safe close |
| `/attempt/:attemptId/report` | Student account | Report (403 until released) |

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

Tables use the shared `DataTable` (TanStack Table: sorting, global filter, column visibility,
pagination, sticky header, loading/empty states). Sort, filter, page and page size live in the URL via
`lib/tableState.ts` (`readTableState` / `writeTableState` / `useTableUrlState`), using a per-table key
prefix (`sort`/`q`, `fsort`/`fq`, `asort`/`aq`) so several tables can coexist on one page. Only
allow-listed sort columns are honoured; defaults are removed from the URL.

### 4.2 Create exam `/exams/new`

Form fields: code, title, description, durationMinutes, allowExtension, maxStrikes, instructions,
opensAt, closesAt, questions and resource rules.

Questions are typed (`SINGLE_CHOICE`, `MULTI_CHOICE`, `TRUE_FALSE`, `SHORT_ANSWER`, `ESSAY`, `CODE`
or `AUTO`/`MANUAL` grading, points, answer keys, explanation). The question dialog has an **Edit /
Preview** toggle: Preview renders the draft through the same `QuestionRenderer` students use
(interactive but never saved), so authors see the real layout, options and input type before saving.

`CODE` questions carry a language (`PYTHON`, `JAVASCRIPT`, `JAVA`), optional starter code, and up to
20 test cases (name, stdin, expected stdout, hidden flag). A question with at least one test defaults
to automatic grading; without tests it needs a reference solution or rubric and stays manual. Client
validation requires a language, an expected output for every test case, and either one test or a
reference solution. The editor is the dependency-free `CodeEditor` (line-number gutter, Tab indent,
Shift+Tab dedent, Enter keeps indentation) — no Monaco/CodeMirror, to stay inside the bundle budget.
The authoring form states that code answers are never compared between candidates for similarity or
authorship, because correct solutions naturally look alike.

Client validation: code required/unique-looking, duration 5–600, maxStrikes 1–10, at least one
question, no empty prompt, and `closesAt` after `opensAt` when both are set. Show a preview of how a
domain rule matches: exact, `*.suffix`, or `re:`. Do not validate the regex server-side only; catch
invalid `re:` patterns in the form.

Submit `POST /api/exams`; on success go to `/exams/:id` with a toast. Creating an exam never opens it
automatically.

### 4.3 Exam detail `/exams/:id`

Header: title, code, status, duration, permission badge, actions (Export menu → CSV spreadsheet / PDF
report, run analysis). Exports call `GET /reports/exams/:id/csv` and `/pdf` and save the file as
`<exam-code>-report.csv|pdf`.
Tabs:

1. **Overview** — description, schedule (`opensAt`/`closesAt`, enrollment count), questions, rules,
   extension allowance, latest run summary. Copy notes that the schedule blocks **new joins only**;
   attempts already in progress can resume.
2. **Attempts** — `GET /exams/:id/attempts` via `DataTable` with URL-synced sorting/filter/page;
   candidate code, status, started/submitted time, answer count, event count, coverage percent,
   coverage warning, late flag. Coverage < 60% shows a warning chip, not a red "cheating" chip.
3. **Findings** — `GET /exams/:id/findings`; filter by type and status. Two sub-tabs: **Pairs** and
   **Incidents**. Both sorted by priority descending. Row: band chip, score, candidates, summary,
   coverage icon, evidence count, status. Click opens `/findings/:id`.
4. **Runs** — `GET /exams/:id/analysis-runs`; status, model version, findings created, timings,
   error. "Run analysis" is disabled while an exam has no submitted attempts or a run is in flight.
5. **Grading** — split view: candidate list, answer, score input, save and progress. Keyboard
   navigation moves between candidates (`ArrowUp`/`ArrowLeft`/`j` previous, `ArrowDown`/`ArrowRight`/
   `k` next, ignored while focus is in an input, textarea, select or contenteditable) with Previous /
   Next buttons and a "Candidate N of M" label. Results stay behind the release gate.
   Coding answers render in a read-only `CodeBlock` with the question's test cases and the per-test
   result chips from `detail` (passed / failed / compile error, duration, hidden flag). A **Re-run
   code judging** button calls `POST /exams/{id}/code-judge`; it never overwrites a hand-marked score.
6. **Settings** — fully editable settings form (title, description, duration, allowExtension,
   maxStrikes, instructions, schedule, resource rules), an **UnsavedChangesGuard** while dirty, and a
   **Results** card showing `releasedCount`/`awaitingReleaseCount` with a link to grading. Also:
   status transitions, permissions (owner/admin), roster management and the audit link.

Run analysis: `POST /exams/:id/analysis-runs`. Show a blocking progress panel because the endpoint is
synchronous; on failure show the returned run error and keep previous findings visible.

The code is immutable; everything else on the Settings tab is editable after candidates join. The
form says duration applies at submit time (lateness), not to timers already running.

**Roster** — a non-empty roster restricts new joins to enrolled emails. The Settings tab lists
enrolled emails with add (`POST /exams/{id}/roster`) and remove (`DELETE …/{entryId}`), shows the
count, and states that an empty roster allows join by exam code alone. Emails are shown to staff only;
candidate-facing screens keep using candidate codes.

### 4.4 Dashboard `/dashboard` (lecturer)

Above "Exam health", a responsive three-up grid of `ChartCard`s:

- **Integrity trend** — `AreaChart` of `focusLossSignals` over the last 14 UTC days; the aria-label is
  "Focus-loss signals per day over the last 14 days"; focus loss is a recorded signal, not enforcement.
- **Band mix** — `PieChart` of active findings by `LOW→CRITICAL` using the design-token band colours.
- **Attempt funnel** — horizontal `BarChart` of Attempts → Submitted → Graded → Released.

Each chart has an explicit empty state rather than an empty plot. The score distribution histogram
sits below with the exam health table, grading queue and flagged candidates.

### 4.5 Finding detail `/findings/:id`

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

### 4.6 Admin dashboard `/admin`

`GET /admin/dashboard` for counts (accounts, exams, attempts, findings), AI service health, recent
analysis runs and the audit trail, plus a **Download overview PDF** action backed by
`GET /reports/admin/overview/pdf`.

**Review findings across exams** — `GET /findings?band=&type=&status=` in a `DataTable` sorted by
priority: band chip, score, type, exam (links to `/exams/:id?tab=findings`), candidates, status and
created time; a row opens `/findings/:id`. Type, band and status selects refetch the same endpoint.
Admins and reviewers see every exam; lecturers only exams they can view. Findings are review aids,
never proof of misconduct.

### 4.7 Audit `/exams/:id/audit`

`GET /exams/:id/audit`; table with actor, action, entity, time and expandable JSON detail. Read-only.
Settings edits appear as `EXAM_SETTINGS_UPDATED` with the changed field names.

## 5. Student flow

### 5.1 Signed-in dashboard `/student`

`GET /api/dashboard/student`. Sections: stats, **Upcoming and available exams**, in-progress attempts,
past attempts and the join-by-code card.

`upcoming` lists enrolled exams that are `OPEN` and have no attempt yet. Each card shows the title,
code, an "Open now" or "Scheduled" chip, "Opens …" / "Closes …", and for `openNow` a Join button that
prefills the exam code in the join card (the candidate code is still typed by the student). Nothing
scheduled renders an explicit empty state, not a blank panel.

Rows in the results table whose marks are not released stay locked: clicking one shows an info toast
("Marks are not released yet…") instead of navigating, so students do not hit a 403 dead end.

### 5.2 Join `/join`

Fields: exam code (prefill from `VITE_DEFAULT_EXAM_CODE` or from the upcoming card), candidate code.
Submit `POST /api/public/join`. Store the attempt token in `sessionStorage` under
`examguard.attempt.<attemptId>` and navigate to `/attempt/:attemptId`. Handle 409 with a clear
"already submitted" screen and 401 with a "codes not accepted" screen; a roster refusal (403) explains
that the account is not enrolled, and a schedule refusal (409) shows the opens/closes time. Never
store the token in a URL.

### 5.3 Exam `/attempt/:attemptId`

- Header: exam title, candidate code, countdown, save indicator, extension status.
- Countdown uses `startedAt + durationMinutes` with a server-time offset captured from the join
  response. Warn at 5 minutes. At zero, submit automatically once; show a blocking receipt.
- Questions are a vertical list or a step navigation on mobile. Autosize textarea, word counter from
  `maxWords`, no rich text.
- `CODE` questions use the same `CodeEditor` seeded with the starter code. The text is saved exactly
  as typed (only CRLF is normalised to LF) — indentation is part of the answer. A caption says the
  code runs against the question's tests on submit. The starter is seeded into the draft once, so the
  student can edit or delete it without it snapping back.
- Autosave: debounce 800 ms, flush on blur, tab hide and submit. Each question keeps a monotonic
  `clientSeq`; on success update `revisionNo` and show "Saved HH:mm". On failure keep the text,
  show "Not saved — retrying" and retry with backoff. Never discard local text.
- Submit: confirmation dialog listing unanswered questions. `POST .../submit` is idempotent. On
  success clear the draft and show the receipt. If the request fails, keep the attempt open.
- Rejoin calls `GET /attempts/:attemptId`, restoring answers and showing a "resumed" toast.

### 5.4 Extension connection panel

The attempt page shows **Connect monitoring extension** with:

- A short explanation: only domain names and navigation times are collected; page content,
  keystrokes and screenshots are never collected.
- A "Copy connection token" button using the `collectorToken` from join.
- The extension ID (from `VITE_EXTENSION_ID` if provided) and a link to install/load instructions.
- Current status from `GET /attempts/:attemptId` (`extensionConnected`, last heartbeat).

The extension popup accepts API base URL + collector token. No page-to-extension messaging is
required; this keeps the extension ID out of the security boundary and works with an unpacked build.

### 5.5 Report `/attempt/:attemptId/report`

Score ring, per-question marks, integrity timeline and review-aid labels; 403 until the lecturer
releases grades. Coding answers render in a read-only `CodeBlock` with the language, and the stored
per-test results (`passed`/`total` and each case's status) when the answer was auto-judged. "No answer
submitted" is shown for an empty code answer. Overlap and authorship review signals are staff-only and
never render here, and the API returns `reviewSignals: []` for students. The print stylesheet hides
the app shell, and the Download PDF button uses the same report payload.

Release gate: a release is refused with `409` while any attempt still has an unscored answer, so a
partial mark can never reach a student.

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
                  DataTable.tsx, LoadingBlock.tsx, UnsavedChangesGuard.tsx,
                  EvidenceCard.tsx, AnswerComparison.tsx, EventTimeline.tsx
  design/         tokens.ts
  features/
    dashboard/    StudentDashboardPage.tsx, LecturerDashboardPage.tsx, AdminDashboardPage.tsx,
                  ScoreDistributionChart.tsx, IntegrityTrendChart.tsx, BandMixChart.tsx,
                  AttemptFunnelChart.tsx
    exams/        ExamListPage.tsx, CreateExamPage.tsx, ExamDetailPage.tsx, ExamOverviewTab.tsx,
                  QuestionsTab.tsx, AttemptsTab.tsx, FindingsTab.tsx, RunsTab.tsx,
                  GradingTab.tsx, SettingsTab.tsx, ExamSettingsForm.tsx
    findings/     FindingDetailPage.tsx, DecisionPanel.tsx
    student/      JoinPage.tsx, AttemptPage.tsx, SubmittedPage.tsx, ExtensionPanel.tsx,
                  StudentDashboardPage.tsx, StudentReportPage.tsx
  lib/            format.ts, domains.ts, autosave.ts, time.ts, tableState.ts
  test/           msw fixtures, render helpers, a11y.test.tsx
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
10. `lib/tableState.test.ts`: defaults, round-trip with unrelated params preserved, per-table key
    prefixes plus the sort allowlist, and clearing defaults/bad page sizes.
11. `SettingsTab.test.tsx`: settings save sends a `PATCH` body, invalid duration blocks the request,
    roster add/remove call `POST`/`DELETE` and refetch.
12. `QuestionsTab.test.tsx`: Preview renders the student `QuestionRenderer` (interactive), switching
    back restores the authoring fields.
13. `GradingTab.test.tsx`: keyboard next/previous moves "Candidate N of M", buttons match, and keys
    typed inside the score input do not navigate.
14. `a11y.test.tsx`: axe on login, join, student/lecturer/admin dashboards, exam overview, grading
    split view and student report (colour-contrast excluded because jsdom has no layout); plus
    `aria-modal="true"` and initial focus inside the integrity warning, question dialog and unsaved
    changes guard.

## 9. Definition of done for the UI

- The demo flow in `README.md` works with no console errors.
- A reviewer can go from exam list to finding to decision in under a minute.
- Keyboard navigation works on the exam, decision dialog, finding tabs and the grading queue; focus is
  trapped in dialogs; colour contrast passes WCAG AA.
- Every score is labelled as review priority; every capped finding shows why.
- No screen claims that the system has detected cheating.
- A lecturer can enrol emails, set a schedule, edit settings after candidates join, and see it in the
  audit trail; a student sees upcoming exams and is refused outside the schedule or roster.
