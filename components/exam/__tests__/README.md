# Automated Unit and Hypothesis Tests

Run all test projects with `npm test`, backend/unit tests with `npm run test:unit`,
or Chromium browser tests with `npm run test:browser`. To refresh visual baselines,
run `npm run test:browser:update`.

Additional validation commands:

- `npm run test:coverage` runs Vitest with V8 coverage and writes text, HTML, and
  LCOV reports under `coverage/`.
- `npm run test:e2e` runs the separate Playwright Test suite against the local
  Next.js development server. It includes a home-page portal smoke test and an
  axe accessibility scan for critical/serious violations.
- `npm run test:database` starts an isolated, temporary PostgreSQL cluster on
  loopback, applies the Prisma schema, runs the unit suite including the real
  foreign-key check, then stops and removes that temporary cluster. It requires
  PostgreSQL 18 command-line tools under `C:\Program Files\PostgreSQL\18\bin`.
  The script overrides both database URL variables for the test process and
  does not use the application's configured database.

The Vitest unit project calls the application route handlers and domain helpers
directly, with Prisma and authentication boundaries mocked using synthetic data.
These mocked tests verify application logic and query intent; they do not prove
live database constraints. The temporary PostgreSQL command additionally
executes `database-relationship.test.ts` against a disposable database.
Browser-mode tests exercise real client components and browser storage alongside
the timer and browser-monitor hook. The separate Playwright E2E tests launch the
application and navigate its home page.

Every Unit Test 1–15 and Hypothesis Test H01–H15 has two separate screenshot
folders: `static-test-evidence-summary/` and
`scenario-specific-ui-screenshots/`. The summaries document covered assertions;
scenario screenshots show the tested UI. Backend-only tests reuse only genuine
product UI for their scenario evidence.

| Test group | Coverage | Test file and type | Static summary and scenario UI |
| --- | --- | --- | --- |
| H01 — Response recovery after interruption | Exact IndexedDB recovery after refresh, offline edits, and abrupt power loss; candidate isolation; question identity; special-character integrity | `response-recovery.browser.test.tsx` — `ExamClient` with controlled timers, mocked APIs, and real IndexedDB encryption | Summary: `hypothesis-test/h01/static-test-evidence-summary/summary.png`; UI: `hypothesis-test/h01/scenario-specific-ui-screenshots/restored-response-after-refresh.png` |
| H02 — Synchronization and same-attempt recovery | Local offline queue, online-triggered sync, exact per-question versions, idempotent and timed-out retries, candidate/assessment/attempt/question ownership, and resuming the same attempt | `response-synchronization.browser.test.tsx` — `ExamClient` with controlled connectivity; `response-synchronization.unit.test.ts` — real sync route and Prisma/PostgreSQL | Summary: `hypothesis-test/h02/static-test-evidence-summary/summary.png`; UI: `hypothesis-test/h02/scenario-specific-ui-screenshots/synchronized-responses-after-reconnection.png` |
| H03 — Authentication and authorization | Role-bound credentials/session, generic login rejection, protected-page redirects, candidate ownership, lecturer/candidate/admin action guards, AI role policy, and timestamped allow/deny audit events | `authentication-authorization.unit.test.ts` — credential helper, auth callbacks, page callback, and API handlers; `authentication-authorization.browser.test.tsx` — Chromium rejection/access evidence | Summary: `hypothesis-test/h03/static-test-evidence-summary/summary.png`; UI: `hypothesis-test/h03/scenario-specific-ui-screenshots/` |
| 1 — Authentication | Active credentials, incorrect password, inactive/unregistered users, and portal mismatch | `unit-tests-1-to-15.unit.test.ts` — route unit tests with mocked Prisma | Summary: `unit-test/unit-test-1-auth/static-test-evidence-summary/login-success-and-denials.png`; UI: `unit-test/unit-test-1-auth/scenario-specific-ui-screenshots/login-rejected.png` |
| 2 — Role authorization | Candidate/admin route decisions, unsupported roles, unauthenticated and forbidden access | `unit-tests-1-to-15.unit.test.ts` — helper/guard unit tests | Summary: `unit-test/unit-test-2-authorization/static-test-evidence-summary/role-access-decisions.png`; UI: `unit-test/unit-test-2-authorization/scenario-specific-ui-screenshots/lecturer-role-access-boundary.png` |
| 3 — Attempt/session locking | Duplicate active attempt, attempt limit, and start-plus-duration expiry | `unit-tests-1-to-15.unit.test.ts` — route unit tests with mocked Prisma | Summary: `unit-test/unit-test-3-session-locking/static-test-evidence-summary/attempt-start-locking.png`; UI: `unit-test/unit-test-3-session-locking/scenario-specific-ui-screenshots/duplicate-session-blocked.png` |
| 4 — Autosave | Q10 persistence, first and subsequent response versions, sync timestamp, and failed save | `unit-tests-1-to-15.unit.test.ts` — route unit tests with mocked Prisma | Summary: `unit-test/unit-test-4-autosave/static-test-evidence-summary/response-save-and-versioning.png`; UI: `unit-test/unit-test-4-autosave/scenario-specific-ui-screenshots/save-status.png` |
| 5 — Response recovery | Exact, empty, whitespace, and long encrypted-cache recovery; latest server versions; interrupted-write atomicity; network failure; corruption and candidate/attempt isolation; staff reactivation and session rotation | `response-recovery-function.browser.test.tsx` — `ExamClient` with real attempt/sync handlers and an isolated in-memory Prisma fixture; `unit-tests-1-to-15.unit.test.ts` — route unit tests | Summary: `unit-test/unit-test-5-recovery/static-test-evidence-summary/recovered-response-and-session.png`; UI: `unit-test/unit-test-5-recovery/scenario-specific-ui-screenshots/` |
| 6 — Synchronization | Exact client-to-server sync; repeated, concurrent, and lost-response retries; stale answer ordering; multiple question versions; failure retention; attempt/candidate/question isolation; server timestamps | `synchronization.browser.test.tsx` — Chromium `ExamClient` with real sync route and serialized in-memory Prisma fixture; `unit-tests-1-to-15.unit.test.ts` — route unit test | Summary: `unit-test/unit-test-6-synchronization/static-test-evidence-summary/idempotent-response-sync.png`; UI: `unit-test/unit-test-6-synchronization/scenario-specific-ui-screenshots/` |
| 7 — Examination timer | Five start/expiry boundaries, countdown display, expiration status and callback | `exam-timer.browser.test.tsx` — Chromium browser tests | Summary: `unit-test/unit-test-7-timer/static-test-evidence-summary/summary.png`; UI: `unit-test/unit-test-7-timer/scenario-specific-ui-screenshots/boundary-*.png` |
| 8 — Objective scoring | 8/10, correct/incorrect/unanswered answers, differing marks and maximum enforcement | `unit-tests-1-to-15.unit.test.ts` — domain unit tests | Summary: `unit-test/unit-test-8-scoring/static-test-evidence-summary/objective-scoring-results.png`; UI: `unit-test/unit-test-8-scoring/scenario-specific-ui-screenshots/` |
| 9 — Question randomization | Deterministic permutation, no missing/duplicate IDs, and question/content association | `unit-tests-1-to-15.unit.test.ts` — domain unit test | Summary: `unit-test/unit-test-9-randomization/static-test-evidence-summary/question-permutation.png`; UI: `unit-test/unit-test-9-randomization/scenario-specific-ui-screenshots/` |
| 10 — Submission receipt | Receipt ID, attempt ID, masked candidate identifier, submitted status, and server timestamp | `unit-tests-1-to-15.unit.test.ts` — domain unit test; `submission-receipt.browser.test.tsx` — Chromium browser test with simulated successful submission and network-retry state | Summary: `unit-test/unit-test-10-receipt/static-test-evidence-summary/masked-submission-receipt.png`; UI: `unit-test/unit-test-10-receipt/scenario-specific-ui-screenshots/submission-confirmation.png` and `unit-test/unit-test-10-receipt/scenario-specific-ui-screenshots/submission-pending.png` |
| 11 — Audit-log generation | Actor/action/entity/reason, timestamp, previous hash and SHA-256 hash | `unit-tests-1-to-15.unit.test.ts` — audit helper unit test; `audit-log.browser.test.tsx` — actual reset and audit API routes rendered in the production `AuditPage` | Summary: `unit-test/unit-test-11-audit-log/static-test-evidence-summary/audit-event-integrity.png`; UI: `unit-test/unit-test-11-audit-log/scenario-specific-ui-screenshots/admin-audit-log-viewer.png` |
| 12 — Database relationship validation | PostgreSQL rejects a response when `response.attempt_id` does not reference an existing attempt | `database-relationship.test.ts` — Prisma integration test against `TEST_DATABASE_URL`; `database-relationship.browser.test.tsx` — renders the validated outcome | Summary: `unit-test/unit-test-12-db-validation/static-test-evidence-summary/response-attempt-relationship.png`; UI: `unit-test/unit-test-12-db-validation/scenario-specific-ui-screenshots/foreign-key-validation.png` |
| 13 — Marking-point calculation | A+C gives 3/5 and over-maximum totals are capped | `unit-tests-1-to-15.unit.test.ts` — scoring unit test; `marking-point-calculation.browser.test.tsx` — rendered grading breakdown | Summary: `unit-test/unit-test-13-marking-points/static-test-evidence-summary/marking-point-score.png`; UI: `unit-test/unit-test-13-marking-points/scenario-specific-ui-screenshots/marking-point-breakdown.png` |
| 14 — Lecturer confirmation | H09: provisional grade stays unconfirmed until a lecturer acts; H10: confirmation, changes, rejection, authorization and mark bounds | `lecturer-confirmation.unit.test.ts` — mocked grade API tests; `lecturer-confirmation.browser.test.tsx` — review actions and rendered states | Summary: `unit-test/unit-test-14-lecturer-confirmation/static-test-evidence-summary/provisional-grade-review.png`; UI: `unit-test/unit-test-14-lecturer-confirmation/scenario-specific-ui-screenshots/` |
| 15 — Monitoring events | Parameterized generation for all 16 browser and webcam events; timestamp, attempt and candidate attribution; duplicate events; unrecognized browser events; and missing identifiers | `unit-tests-1-to-15.unit.test.ts` — authenticated route validation; `monitoring-event-generation.browser.test.tsx` — browser/webcam hooks and candidate feed | Summary: `unit-test/unit-test-15-monitoring-events/static-test-evidence-summary/summary.png`; UI: `unit-test/unit-test-15-monitoring-events/scenario-specific-ui-screenshots/monitoring-event-feed.png` |
| H04–H15 — Remaining hypothesis tests | Timing, locking, receipts, randomization, scoring, marking, AI workflow, monitoring, audit, integrity, usability, and acceptance matrix scenarios | Corresponding `*.browser.test.tsx` suite for each H-number | Each `hypothesis-test/hNN/` contains `static-test-evidence-summary/summary.png` and the scenario UI images under `scenario-specific-ui-screenshots/` |

H15 acceptance tooling writes unit and browser reports to
`test-results/h15/vitest-unit.json` and
`test-results/h15/vitest-browser.json` with
`npm run test:unit:h15-results` and `npm run test:browser:h15-results`.
After the proposal requirements are entered in
`scripts/h15/requirements.json`, collect these reports with
`npx tsx scripts/h15/collect-results.ts scripts/h15/requirements.json test-results/h15 test-results/h15/collected-results.json`.
Build the CSV matrix, markdown matrix, and tested-conditions conclusion with
`npx tsx scripts/h15/build-matrix.ts scripts/h15/requirements.json test-results/h15/collected-results.json test-results/h15/acceptance-matrix`.
An optional fourth argument supplies a JSON file containing environment,
browsers, participants, and loadLevels strings. The requirements template is
intentionally empty, so collection and matrix generation stop until the
proposal expectations and required thresholds are supplied.

H01 local response records are encrypted in the `responses` IndexedDB store.
Each encrypted payload now includes its candidate ID as well as the question-keyed
response map; recovery rejects records whose candidate ID does not match the
authenticated attempt. Older cached records without candidate binding are not
restored.

The H02 browser test drives `ExamClient` against a deterministic server fixture.
The companion H02 handler integration test runs the actual synchronization API
route with Prisma against the temporary PostgreSQL cluster created by
`npm run test:database`; it does not use the configured application database.
Response history records both written text and selected multiple-choice option
changes in `ResponseVersion`.

Unit Test 5 uses the real encrypted IndexedDB helper and invokes the actual
attempt-load and synchronization handlers against an isolated in-memory Prisma
fixture. The local cache retains the latest response text per question; ordered
history and version numbers live in the server-side `ResponseVersion` records.
Responses currently have no configured size limit, so the browser test checks
that long values remain exact rather than asserting a size-boundary policy.

Unit Test 6 treats the encrypted response snapshot as the existing local pending
store and invokes the actual sync API route against a serialized in-memory
Prisma fixture. The server currently has no explicit idempotency token or
exponential retry/backoff policy; failures remain pending and can be retried by
the existing 30-second sync interval, an online event, or the manual save
action. Repeated saves are idempotent through the attempt/question unique key,
answer-change ordering, and content-aware version creation. Invalid questions
reject the complete sync batch before any response is written, so failure
isolation is tested by retrying a later valid batch rather than expecting a
partial batch commit.

Run Unit Test 14 alone with
`npx vitest run --project unit components/exam/__tests__/lecturer-confirmation.unit.test.ts -t "H09|H10"`
and
`npx vitest run --project browser components/exam/__tests__/lecturer-confirmation.browser.test.tsx -t "H09|H10"`.

## Integration tests

Run the isolated PostgreSQL and prompt-aligned browser workflows with
`npm run test:integration`. It regenerates Prisma Client, provisions a unique
loopback PostgreSQL cluster, applies the schema, runs 18 IT-tagged API/database
workflows plus a PostgreSQL synchronization test, runs selected autosave,
recovery, synchronization, and submission browser cases, then runs the complete
attempt-session locking suite. The temporary cluster is removed afterward.

Latest validated result: 18 prompt-tagged DB workflows passed (one supplemental
load case is filtered); PostgreSQL synchronization passed 1/1; selected browser
cases passed 14/14 with nine unrelated cases filtered; session-locking passed
21/21. Auth.js identities and AI provider responses are deterministic test
boundaries; role checks, production route logic, and Prisma persistence run
against the isolated database. Images under `integration-test/it-NN-*/` are
visual evidence only; API/database assertions determine outcomes.

## 168-prompt system test run

The 14-area prompt set is indexed under
`__screenshots__/system-test/README.md`. Each of its 168 prompts has a dedicated
folder with both `static-test-evidence-summary/` and
`scenario-specific-ui-screenshots/`, plus a report recording preconditions,
synthetic data, steps, expected and actual results, evidence, and Pass/Blocked
status. The root `prompt-results.csv` is the machine-readable index.

The execution report records 132 Pass, 0 Fail, and 36 Blocked. Pass means the
mapped automated assertions ran successfully; it does not claim every prompt
was separately replayed in a live session. Blocked prompts identify scenarios
requiring human participants, physical devices, unconfigured policies, or a
production-like performance environment. Scenario images are reused from the
related passing UI tests and are explicitly identified in each report; static
summary images are kept separate.

The full Chromium browser project passed 311 tests across 28 files, with one
skipped. The controlled performance smoke sent 25 concurrent synthetic
candidate response-sync requests to the real route handler against disposable
loopback PostgreSQL and persisted 25/25 with zero request errors. The latest
database run measured 760.7 ms wall time, 712.7 ms request p50, 750.8 ms
request p95, and 32.9 requests/second. These are local handler/database
measurements, not a production objective or a full examination simulation.

The H13 integrity run verifies response/question and grade-decision/response
foreign keys and the response-version unique index declared in
`prisma/schema.prisma` and `20261017170000_response_integrity_constraints`.
Its duplicate-version probe reuses an existing `(response_id, version_num)` key
and confirms PostgreSQL rejects it.

## Database test limitation

The repository's schema uses PostgreSQL. Test 12 verifies the declared Prisma
relation in the normal unit run. `npm run test:database` provisions a temporary
PostgreSQL cluster, applies the schema, and executes the foreign-key enforcement
integration check without connecting to the application's database. The cluster
is bound to loopback and removed when the command finishes. To run the
integration test directly, set `TEST_DATABASE_URL` to a migrated, isolated
PostgreSQL test database and run
`npx vitest run --project unit components/exam/__tests__/database-relationship.test.ts`.
The integration test is skipped when `TEST_DATABASE_URL` is absent.

`npm run test:database` uses `prisma db push`; it does not validate the full
migration history. A separate empty-database `prisma migrate deploy` check
currently stops at the older `20261007143000_feature_updates` migration because
it assumes the `questions` table already exists. The newly added response
integrity migration SQL was applied successfully to a disposable PostgreSQL
schema, but the legacy migration chain still needs a baseline before it can be
verified end to end from an empty database.

The staging k6 journey is documented in `scripts/LOAD_TESTING.md`, but `k6` is
not installed here and no staging URL or synthetic account set was supplied.
The 20–30-user end-to-end load journey, sustained/stress load, and production
thresholds remain Blocked. Human usability sessions and physical second-device
testing also remain Blocked; the browser rehearsal is technical evidence, not
participant research.

The login, attempt, sync, recovery, grading and monitoring tests mock the database
boundary, so running the unit/browser test suites does not require credentials or
write to the configured application database.

H03 calls the real `authorizeCredentials` function, Auth.js callbacks, protected
page authorization callback, attempt/grade/admin/AI handlers, and role guards.
Prisma is replaced by a deterministic in-memory fixture that stores registered
synthetic users, attempt ownership and audit events; the AI provider is stubbed
and never contacted. Credential denials and protected-resource denials produce
timestamped audit events with an action, outcome and actor/account identifier
where available. The browser evidence renders the failed-login and redirect
decision states using the required black-on-white Times New Roman presentation.

The Unit Test 12 browser screenshot is a visual presentation of the database
validation result; it does not connect to PostgreSQL. The foreign-key assertion
is executed by `database-relationship.test.ts` with `npm run test:database`.
Capture or verify its visual baseline with
`npx vitest run --project browser components/exam/__tests__/database-relationship.browser.test.tsx`.

The timer PNGs are screenshots of the isolated rendered timer fixture used by
the browser test, not of the live `/exam/test-attempt-id` route. Capturing that
route remains a separate operation using `node scripts/take-exam-screenshot.mjs`
while the Next.js dev server is running; that live-route capture was not run as
part of this suite.

Backend test evidence pages are labelled summaries rather than production app
screenshots. Their assertion outcomes come from the Vitest run, not from the
appearance of the summary page.
