ALTER TABLE "memorization_progress" ADD COLUMN "rangeStart" INTEGER, ADD COLUMN "rangeEnd" INTEGER, ADD COLUMN "days" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "memorization_progress" ADD CONSTRAINT "memorization_progress_range_valid" CHECK (("rangeStart" IS NULL AND "rangeEnd" IS NULL) OR ("rangeStart" >= 1 AND "rangeEnd" >= "rangeStart"));
CREATE INDEX "memorization_progress_plan_ranges_idx" ON "memorization_progress" ("planId", "rangeStart", "rangeEnd");
