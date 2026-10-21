CREATE TABLE IF NOT EXISTS "monitoring_events" (
  "id" TEXT NOT NULL,
  "attempt_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "meta_json" TEXT,
  "reviewed" BOOLEAN NOT NULL DEFAULT false,
  "reviewed_by" TEXT,
  "reviewed_at" TIMESTAMP(3),
  CONSTRAINT "monitoring_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "monitoring_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "monitoring_events_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "monitoring_events_attempt_id_idx" ON "monitoring_events"("attempt_id");

CREATE TABLE IF NOT EXISTS "snapshots" (
  "id" TEXT NOT NULL,
  "monitoring_event_id" TEXT,
  "attempt_id" TEXT NOT NULL,
  "image_data" TEXT NOT NULL,
  "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "viewed_by" TEXT,
  "deleted_at" TIMESTAMP(3),
  "retention_until" TIMESTAMP(3),
  CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "snapshots_monitoring_event_id_key" UNIQUE ("monitoring_event_id"),
  CONSTRAINT "snapshots_monitoring_event_id_fkey" FOREIGN KEY ("monitoring_event_id") REFERENCES "monitoring_events"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "snapshots_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "snapshots_viewed_by_fkey" FOREIGN KEY ("viewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "snapshots_attempt_id_idx" ON "snapshots"("attempt_id");
