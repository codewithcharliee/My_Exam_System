CREATE TYPE "course_semester" AS ENUM ('first', 'second', 'full_year');

ALTER TABLE "courses"
ADD COLUMN "semester" "course_semester";

UPDATE "courses"
SET "semester" = CASE
  WHEN upper("code") ~ '^LAW ?599$' THEN 'full_year'::"course_semester"
  WHEN substring("code" from '([0-9]+)$')::integer % 2 = 1 THEN 'first'::"course_semester"
  ELSE 'second'::"course_semester"
END
WHERE "code" ~ '([0-9]+)$'
  AND upper("code") ~ '^(LAW|PUL|PPL|CIL|CLE|JIL)';
