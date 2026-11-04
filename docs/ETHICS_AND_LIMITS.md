# Ethics, privacy and limits

This project handles sensitive data about students in a power-asymmetric setting. Engineering quality
is necessary but not sufficient. These constraints are part of the design, not an afterthought.

## Purpose limitation

The system supports **human review of examination integrity**. It must not be used for:

- automatic accusations, grade penalties or disciplinary decisions;
- general surveillance outside an active attempt;
- monitoring personal browsing, page content, messages or keystrokes;
- predicting "cheating" as a probability without validated calibration.

Every finding is a prompt to look at evidence. The lecturer decides.

## Data minimisation

- Candidate identity is a code. Names are optional labels, not required.
- The extension records the registrable domain and navigation event only. No URLs, page titles,
  content, form data, keystrokes, screenshots or clipboard.
- Answer revisions and server timestamps are stored; there is no keystroke log.
- Analysis payloads contain only what the feature needs. Pair analysis cannot receive activity data.
- Logs must not contain answer text or tokens.

## Consent and disclosure

Before an attempt: explain what is observed, why, for how long, who can see it, retention, and how to
ask questions. Make extension installation optional only if the assessment design accepts the resulting
coverage gaps; if it is required, say so explicitly and provide an alternative arrangement for
students who cannot install it.

Consent must be freely given in the institutional sense. A student cannot meaningfully refuse
monitoring if refusal is treated as evidence of wrongdoing. Absence of observations is **unknown**,
not suspicious.

## Retention and access

- Store attempts, events and findings only as long as the review and appeal window requires.
- Delete or irreversibly pseudonymise after that window; document the job and test it.
- Access is least-privilege: exam owner/reviewer only, audited.
- Exports must exclude unnecessary personal data.

## False positives and human oversight

Similarity is not misconduct. Common causes of legitimate similarity: formulaic answers, correct
textbook definitions, shared lecture material, group study, non-native phrasing, and paraphrasing a
permitted source. The system must:

- show raw evidence and coverage caveats alongside the priority band;
- require a rationale for every decision;
- keep an appeal path and decision history;
- never hide missing evidence behind a low score.

Reviewer workload is a safety property. If the queue is flooded, reviewers skim and false positives
cause harm. Precision@k and false alarms per 100 cases are primary metrics.

## Browser extension

- Install only with informed consent; show a visible connected state.
- Capture only during a connected attempt; stop on disconnect or submit.
- Never read page content; the content script only passes the session token and visibility events.
- Publish a privacy policy and a clear uninstall/delete path.
- For real deployments, sign the extension, pin its ID and distribute through managed policy.

## Legal context

- GDPR/UK GDPR: monitoring likely requires a data protection impact assessment, a lawful basis,
  transparency, minimisation and a retention schedule.
- The EU AI Act classifies AI intended to detect prohibited behaviour during tests in educational
  institutions as high-risk (Annex III). Real deployments need risk management, logging, human
  oversight, transparency and bias monitoring.
- Local education and employment law may add consultation and appeal requirements.

This repository does not constitute legal advice. Obtain institutional review before any pilot with
real students.

## Research ethics

- Labels from scripted scenarios are not misconduct ground truth.
- Instructed-sharing pilots must be clearly framed, ungraded, debriefed and approved.
- Do not publish identifiable data or free-text answers without consent.
- Report limitations, false positives and coverage failures with the results.

## Red lines

Do not add: lock-down browsers, webcam/microphone monitoring, keystroke logging, screenshot capture,
social-media checks, automated sanctions, or a "cheating probability" display. These change the
project's ethical and legal character and are outside its stated purpose.
