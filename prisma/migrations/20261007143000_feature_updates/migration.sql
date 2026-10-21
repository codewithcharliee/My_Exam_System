CREATE TYPE "QuestionStatus" AS ENUM ('draft', 'approved');
ALTER TABLE "questions" ADD COLUMN "status" "QuestionStatus" NOT NULL DEFAULT 'approved';
ALTER TABLE "questions" ADD COLUMN "word_limit" INTEGER;
ALTER TABLE "questions" ADD COLUMN "word_target" INTEGER;
ALTER TABLE "attempts" DROP COLUMN IF EXISTS "device_meta";
ALTER TABLE "attempt_sessions" DROP COLUMN IF EXISTS "ip_address";
ALTER TABLE "attempt_sessions" DROP COLUMN IF EXISTS "user_agent";
