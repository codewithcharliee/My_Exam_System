ALTER TABLE "users"
ADD COLUMN "academic_level" INTEGER,
ADD COLUMN "staff_title" TEXT;

ALTER TABLE "courses"
ADD COLUMN "is_elective" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "credit_units" INTEGER,
ADD COLUMN "catalog_source" TEXT;