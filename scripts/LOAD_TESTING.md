# Staging exam load test

The k6 scenario in `k6-exam-load.js` follows the application's real candidate flow: NextAuth credentials login, session verification, attempt start, attempt load, two response syncs (autosave and sync), and submission. It creates and submits real attempts, so use only a disposable staging database and candidate accounts.

## Prepare staging data

- Deploy the same application build and database schema you intend to evaluate. The app must be reachable from the machine running k6.
- Publish an assessment that is currently open and has questions. Give the disposable candidates the `candidate` role, active accounts, enrollment in the assessment's course, and a passing `readiness_summary` check.
- Ensure each candidate can start an attempt and has no active attempt. The test submits every attempt and consumes an attempt allowance; recreate or reset the disposable data before rerunning.
- Create one unique login per virtual user. Keep their credentials in a JSON file outside the repository, for example:

  ```json
  [
    { "email": "load-candidate-001@example.test", "password": "use-your-staging-password" },
    { "email": "load-candidate-002@example.test", "password": "use-your-staging-password" }
  ]
  ```

The JSON file must contain at least as many accounts as `MAX_VUS` (300 by default). Do not point this test at production or use real candidate accounts.

## Run

Install k6 using its official Windows instructions, then run from the `next` directory in PowerShell:

```powershell
k6 run `
  -e BASE_URL=https://staging.example.test `
  -e ASSESSMENT_ID=your-published-assessment-id `
  -e CANDIDATES_FILE='C:\secure\load-test-candidates.json' `
  -e MAX_VUS=300 `
  scripts\k6-exam-load.js
```

The default ramp adds 10, 50, 100, 200, and 300 virtual users over one minute per step, holds at the maximum for one minute, then ramps down. Each virtual user uses a different account and runs the candidate journey once. Each candidate pauses five seconds between autosave and sync. For a smaller test, set `MAX_VUS` no higher than the number of accounts provided.

The default k6 thresholds are p95 request duration below 2 seconds and failed-request rate below 1%. These are starting guardrails, not claims about acceptable service levels; set `P95_THRESHOLD_MS` and `ERROR_RATE_THRESHOLD` to the agreed staging targets. `STAGE_DURATION` and `THINK_TIME_SECONDS` can also be set to adjust ramp speed and pause length.

## Review results

Keep the k6 summary with the run date, app build, database/service sizes, `MAX_VUS`, test duration, failed-request rate, and p(90)/p(95) durations. Compare individual endpoint timings as well as overall thresholds. Stop the test if the staging service or database becomes unhealthy; report only the concurrency and results actually measured.
