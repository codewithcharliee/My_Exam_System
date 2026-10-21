# Implementation outcomes

## Batch export and archival
Implement a protected export route for administrators and lecturers, restrict lecturers to assigned courses, accept an assessment, optional course filter, format, and requester password, generate AES-256 password-protected ZIP scripts or an aggregated spreadsheet in memory, exclude password hashes and accommodation reasons, and record `export_generated` without recording the password.

## In-exam issue reporting
Store issue reports with attempt, candidate, category, description, telemetry, timestamps, and acknowledgement fields, provide protected create, list, and acknowledge routes, add a discreet exam dialog, show reports in monitoring, and audit creation and acknowledgement without changing response data or pausing the exam.

## Connection health and synchronization indicators
Add the authenticated health endpoint, fifteen-second latency and browser online monitoring hook, distinct online, degraded, and disconnected connection states, distinct pending, synchronizing, server-confirmed, and failed synchronization states, and replace the existing Saving and Saved label without delaying exam entry or timer operation.

## Operational and institutional reporting
Extend protected reporting for administrator and examination officer institutional summaries, preserve lecturer course scope, label provisional and AI recommendations separately from confirmed grades, suppress groups smaller than five, keep reports read-only, and record report views.

## Session integrity and continuity
Add hashed session tokens, last-seen timestamps, user agent, and superseded state, validate the token on exam start, resume, sync, submit, and unlock, reject missing or mismatched tokens with a clear error, record duplicate session events, and retain the two-attempt rule.

## Live word count and lecturer-defined word limits
Keep live word counts visible, display target and limit guidance, update accessibly, warn when a limit is exceeded, and never block typing, text entry, or grading.

## Pause and resume tracking
Persist recent pause and resume time events for tab hidden, window blur, fullscreen exit, and inactivity, sync them through the existing event route, and expose interaction context without affecting grades.

## Accessibility support
Add skip links, landmarks, accessible names, focus-visible controls, question navigation semantics, live regions, keyboard-safe monitoring behavior, a reduced text-size compatible layout, and document checks and limitations in `ACCESSIBILITY.md`.
