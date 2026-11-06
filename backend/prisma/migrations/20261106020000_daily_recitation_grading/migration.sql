-- Daily recitation grading is intentionally separate from official exam scoring.
ALTER TABLE "recitations"
  ADD COLUMN "tajweed" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "daily_recitation_grading_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "mistakePenalty" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "warningPenalty" DOUBLE PRECISION NOT NULL DEFAULT 0.25,
  "tajweedPenalty" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_recitation_grading_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daily_recitation_grading_settings_singleton" CHECK ("id" = 'default'),
  CONSTRAINT "daily_recitation_grading_settings_nonnegative" CHECK (
    "mistakePenalty" >= 0 AND "warningPenalty" >= 0 AND "tajweedPenalty" >= 0
  )
);

INSERT INTO "daily_recitation_grading_settings" ("id") VALUES ('default')
ON CONFLICT ("id") DO NOTHING;

CREATE OR REPLACE FUNCTION calculate_daily_recitation_grade() RETURNS trigger AS $$
DECLARE
  rule RECORD;
  total_verses DOUBLE PRECISION;
  total_deduction DOUBLE PRECISION;
  ratio DOUBLE PRECISION;
BEGIN
  SELECT "mistakePenalty", "warningPenalty", "tajweedPenalty"
    INTO rule FROM "daily_recitation_grading_settings" WHERE "id" = 'default';
  total_verses := GREATEST(COALESCE(NEW."versesCount", 0), 0);
  total_deduction := GREATEST(COALESCE(NEW."mistakes", 0), 0) * COALESCE(rule."mistakePenalty", 1)
    + GREATEST(COALESCE(NEW."warnings", 0), 0) * COALESCE(rule."warningPenalty", 0.25)
    + GREATEST(COALESCE(NEW."tajweed", 0), 0) * COALESCE(rule."tajweedPenalty", 1);
  NEW."points" := ROUND(GREATEST(0, total_verses - total_deduction)::numeric, 2)::double precision;
  ratio := CASE WHEN total_verses = 0 THEN 0 ELSE NEW."points" / total_verses END;
  NEW."evaluation" := CASE
    WHEN ratio >= 0.95 THEN 'EXCELLENT'::"Evaluation"
    WHEN ratio >= 0.85 THEN 'VERY_GOOD'::"Evaluation"
    WHEN ratio >= 0.70 THEN 'GOOD'::"Evaluation"
    WHEN ratio >= 0.50 THEN 'ACCEPTABLE'::"Evaluation"
    ELSE 'UNSATISFACTORY'::"Evaluation"
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recitations_calculate_daily_grade"
  BEFORE INSERT OR UPDATE OF "versesCount", "mistakes", "warnings", "tajweed", "points", "evaluation"
  ON "recitations"
  FOR EACH ROW EXECUTE FUNCTION calculate_daily_recitation_grade();
