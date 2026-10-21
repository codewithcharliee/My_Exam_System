ALTER TABLE "attempt_sessions" ADD COLUMN IF NOT EXISTS "session_token_hash" TEXT;
ALTER TABLE "attempt_sessions" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "attempt_sessions" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;
ALTER TABLE "attempt_sessions" ADD COLUMN IF NOT EXISTS "superseded_at" TIMESTAMP(3);
UPDATE "attempt_sessions" SET "session_token_hash" = COALESCE("session_token_hash", md5("id")) WHERE "session_token_hash" IS NULL;
ALTER TABLE "attempt_sessions" ALTER COLUMN "session_token_hash" SET NOT NULL;
CREATE INDEX IF NOT EXISTS "attempt_sessions_attempt_id_superseded_at_idx" ON "attempt_sessions"("attempt_id", "superseded_at");
CREATE TABLE IF NOT EXISTS "issue_reports" (
  "id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" VARCHAR(500),
  "telemetry_json" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by" TEXT,
  "acknowledgement_note" VARCHAR(500),
  CONSTRAINT "issue_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "issue_reports_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE,
  CONSTRAINT "issue_reports_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "issue_reports_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "issue_reports_attempt_id_created_at_idx" ON "issue_reports"("attempt_id", "created_at");
CREATE INDEX IF NOT EXISTS "issue_reports_candidate_id_idx" ON "issue_reports"("candidate_id");
CREATE TABLE IF NOT EXISTS "attempt_time_events" (
  "id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "duration_secs" INTEGER,
  "reason" VARCHAR(500),
  CONSTRAINT "attempt_time_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attempt_time_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "attempt_time_events_attempt_id_occurred_at_idx" ON "attempt_time_events"("attempt_id", "occurred_at");
