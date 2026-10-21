ALTER TABLE "responses"
ADD CONSTRAINT "responses_question_id_fkey"
FOREIGN KEY ("question_id") REFERENCES "questions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grade_decisions"
ADD CONSTRAINT "grade_decisions_attempt_id_question_id_fkey"
FOREIGN KEY ("attempt_id", "question_id")
REFERENCES "responses"("attempt_id", "question_id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "response_versions_response_id_version_num_key"
ON "response_versions"("response_id", "version_num");
