-- The exam's evaluation is derived from its score by the school's grading scale
-- (90/80/70/60). Stored so an official result never changes retroactively.

ALTER TABLE "exams" ADD COLUMN "evaluation" "Evaluation";

-- Backfill the results that have already been graded.
UPDATE "exams"
SET "evaluation" = CASE
  WHEN "score" >= 90 THEN 'EXCELLENT'::"Evaluation"
  WHEN "score" >= 80 THEN 'VERY_GOOD'::"Evaluation"
  WHEN "score" >= 70 THEN 'GOOD'::"Evaluation"
  WHEN "score" >= 60 THEN 'ACCEPTABLE'::"Evaluation"
  ELSE 'UNSATISFACTORY'::"Evaluation"
END
WHERE "score" IS NOT NULL;
