# Copilot instructions for this repository

## Project overview

This repo is a Next.js 16 App Router application for a secure online examination system for the Bingham University Faculty of Law. The codebase is organized around a Prisma/PostgreSQL data model, NextAuth credential-based authentication, and role-based exam workflows.

Important repo-specific context:
- The app root for this project is the `next/` directory.
- `app/layout.tsx` is the single place for cross-app infrastructure and global providers; do not remove or rearrange the existing provider entries without a clear reason.
- `AGENTS.md` and `CLAUDE.md` are project-level guardrails. In particular, this repo includes a custom Next.js warning: read the relevant docs in `node_modules/next/dist/docs/` before making code changes, because this version has behavior and conventions that differ from stock Next.js.

## Build, test, and lint commands

Run all commands from the `next/` directory.

- Install dependencies: `npm install`
- Start the app locally: `npm run dev`
- Production build: `npm run build`
- Start production server: `npm run start`
- Lint: `npm run lint`
- Full unit + browser test suite: `npm run test`
- Unit-only suite: `npm run test:unit`
- Browser-only suite: `npm run test:browser`
- Update browser snapshots: `npm run test:browser:update`
- Coverage report for unit tests: `npm run test:coverage`
- Playwright end-to-end suite: `npm run test:e2e`
- Database test script: `npm run test:database`

Single-test execution patterns:
- Unit test file: `npx vitest run --project unit components/exam/__tests__/your-file.unit.test.ts`
- Browser test file: `npx vitest run --project browser components/exam/__tests__/your-file.browser.test.tsx`
- Direct `vitest` file invocation also works in the repo when targeting a specific test path.

## High-level architecture

### App structure
- `app/`: App Router pages and route handlers.
  - `app/api/`: protected API routes for exports, issue reporting, health checks, reporting, and session management.
  - `app/(auth)` and `app/(dashboard)`: portal-specific sections and pages.
  - `app/layout.tsx`: global metadata, fonts, and providers.
- `components/`: UI and features.
  - `components/exam/`: exam client logic, hooks, status indicators, and scoring-related UI.
  - `components/ui/`: shared design-system primitives.
  - `components/providers.tsx`: app-wide Providers wrapper.
- `lib/`: shared utilities, auth, and role logic.
  - `lib/prisma.ts`: Prisma singleton and DB access.
  - `lib/role-access.ts`: role and portal access logic.
  - `lib/scoring.ts`, `lib/exam-randomization.ts`, `lib/session-integrity.ts`: exam-specific domain logic.
- `prisma/schema.prisma`: central domain model for users, courses, assessments, attempts, results, issues, audit events, and related exam lifecycle data.
- `auth.ts` and `auth.config.ts`: NextAuth setup and credentials authorization.
- `styles`/design tokens are primarily delivered through Tailwind and CSS variables rather than one-off style definitions.

### Exam system flow
The app is built around an exam lifecycle rather than a generic CRUD app:
- users are assigned roles (`admin`, `exam_officer`, `lecturer`, `invigilator`, `candidate`) and mapped to courses;
- assessment/question data is modeled in Prisma with versioning, type, difficulty, competence, and grading metadata;
- attempts are tracked with statuses such as `not_started`, `in_progress`, `submitted`, `timed_out`, `abandoned`, and `reset`;
- exam-client behavior is split between UI components and supporting logic like scoring, synchronization, session integrity, and issue reporting;
- dashboard and operational reporting views are role-restricted and read-only for authorized staff.

## Key conventions and repo-specific expectations

### Styling and UI
- Use the project’s Tailwind design tokens and CSS variables instead of hardcoded colors or custom hex values.
- Prefer the existing primitives in `components/ui` and the layout helpers documented in `STYLE_GUIDE.md` over ad hoc markup.
- Keep the Bingham University exam-system visual language consistent: compact, professional, text-first, and accessible.
- Use `font-sans`, `font-display`, and `font-mono` as defined by the app font variables; avoid inventing new typography conventions.

### Authentication and authorization
- Respect the role/portal model defined by `auth.ts` and `lib/role-access.ts`.
- Do not bypass the existing role checks in route handlers or API code.
- Candidate access is intentionally constrained to the correct portal and account status; treat `user.accountStatus` as a first-class security concern.

### Data access and persistence
- Use the shared Prisma singleton from `lib/prisma.ts`; do not create ad hoc client instances in new files.
- Keep Prisma schema changes aligned with the existing naming conventions and `@map(...)` field names.
- If a change affects exam flows, review the relevant Prisma models and the existing exam-related utilities before patching.

### Testing
- The test setup is Vitest with two projects: `unit` and `browser`.
- Keep browser-specific tests under `components/exam/__tests__/**/*.browser.test.tsx` and unit tests under `**/*.unit.test.ts`.
- Prefer targeting a single file when iterating on a fix instead of rerunning the full suite.
- For browser tests that capture screenshots, follow `.github/instructions/browser-screenshots.instructions.md`.
- For screenshot baselines, the repository's existing canonical folder layout takes precedence over paths suggested by an individual prompt. Reuse the existing folder; if it does not exist, create it using the established unit/hypothesis hierarchy and naming convention rather than making a parallel or shortened folder.

### Code layout
- Keep route handlers in `app/api` and shared logic in `lib` rather than placing business logic in page components.
- Maintain a clear split between server-side data access, role enforcement, and client-only UI behavior.
- For exam-related work, inspect both the UI and the supporting logic (`lib/scoring.ts`, `lib/session-integrity.ts`, etc.) because the feature behavior is spread across multiple layers.

## Existing repo guidance to respect

- `AGENTS.md`: this repo is intentionally not a stock Next.js app; read the local Next.js docs before writing code.
- `STYLE_GUIDE.md`: follow the documented layout, typography, color tokens, spacing, and component usage patterns.
- `plan.md`: confirms that exam features are intentionally distributed across route handlers, Prisma models, and exam client logic; keep that architectural pattern when extending the system.

## When in doubt

Prefer reading the relevant route, Prisma model, and matching UI/test file together before changing behavior. This project’s features are intentionally spread across multiple layers, and the correct fix usually requires understanding the interaction between the API, the database schema, and the exam client.

## Automatic production deployment

- After completing a change the user requested in this repository, run the relevant checks and, if they pass, commit the changes you made and push them to `main` so Vercel can deploy them. Do not ask for separate confirmation before committing or pushing.
- Review `git status` and the staged diff first. Stage only files changed for the current request; never include unrelated user changes, generated files, local environment files, credentials, or secrets. If changes cannot be safely separated, stop and ask the user.
- Do not commit or push if relevant checks fail, the change is incomplete, the push would require overwriting remote history, or the repository state is otherwise unsafe. Explain the blocker and ask the user how to proceed.
- Use a concise commit message. After pushing, confirm the branch and commit; report any deployment status only when verified.
- If the user asks not to publish a particular change, respect that request.

## Mandatory Test-Driven Debugging and Automatic Repair

Whenever you create, execute, or modify tests using Vitest, Jest, React Testing Library, Playwright, Cypress, or any other testing framework, you MUST follow this iterative testing and repair workflow.

### Required Workflow

1. **Understand:** Inspect the feature requirements, implementation, dependencies, existing tests, and project conventions before making changes.
2. **Test:** Run the relevant existing tests and create or improve tests that verify the feature's actual expected behavior, including important edge cases and error conditions.
3. **Diagnose:** When a test fails, inspect the error messages, stack traces, assertions, and related code to identify the root cause. Determine whether the failure is caused by the implementation, the test, the environment, or an external dependency.
4. **Fix:** Correct genuine implementation defects in the production code. Correct tests only when they are demonstrably incorrect or inconsistent with documented requirements. Make minimal, reliable changes that preserve existing functionality and security.
5. **Retest:** Rerun the failing test after every meaningful fix. Then run the relevant test file, related regression tests, and broader test suites when practical.
6. **Repeat:** If failures remain, investigate and repair them, repeating the test-and-fix cycle until the applicable verification criteria are satisfied or a clearly documented blocker prevents further progress.
7. **Verify:** Run relevant type checks, linting, build checks, and regression tests when applicable. Review the final changes for unintended side effects.

### Non-Negotiable Rules

- Do not stop after identifying a failure when a safe, evidence-based fix is possible.
- Do not weaken assertions, delete valid tests, skip failing tests, suppress errors, or modify expected results merely to obtain a passing test report.
- Do not mock away the functionality that the test is intended to verify.
- Do not claim a feature works unless the actual test results support that conclusion.
- Do not assume that a passing unit test proves that the entire feature works.
- Investigate flaky tests and environmental failures rather than repeatedly rerunning them until they pass.
- Preserve unrelated user changes, existing project conventions, and security controls.
- Never use production data or perform destructive production operations during testing without explicit authorization.
- Do not make destructive database changes, expose secrets, or perform other high-impact operations without the required authorization.

### Examination System Priorities

Pay particular attention to authentication, role-based authorization, examination session locking, prevention of unauthorized restarts, timers, autosave, response recovery, concurrent submissions, objective scoring, question randomization, submission receipts, audit logs, database relationships, lecturer marking, and proctoring records.

Verify critical examination rules at the server and database levels where applicable. Test relevant failure scenarios such as network interruptions, duplicate requests, concurrent operations, expired sessions, unauthorized access, and page refreshes.

### Completion Report

After each testing and repair task, report:

1. Features and requirements tested.
2. Initial failures and their root causes.
3. Production code and test files changed.
4. Fixes implemented.
5. Tests executed and actual pass/fail results.
6. Regression, type-checking, linting, and build results where applicable.
7. Remaining failures, environmental limitations, or unverified behavior.

Continue the test → diagnose → fix → retest → regression-test cycle until the required checks pass or a documented blocker prevents completion. Never fabricate test results or conceal unresolved defects.

**Primary objective:** Deliver correctly functioning, secure, maintainable software—not merely a green test report.