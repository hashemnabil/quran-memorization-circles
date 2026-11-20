-- Additive recovery for an existing database that has no managed Prisma history.
-- Run once in the SQL editor before deploying this application version.
-- Do not run this if migration 20261018090000_school_operations is already applied.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = public;
DO $guard$
BEGIN
  IF to_regclass('public.exam_sections') IS NULL OR to_regclass('public.exams') IS NULL OR to_regclass('public.exam_requests') IS NULL OR to_regclass('public.exam_milestone_records') IS NULL THEN
    RAISE EXCEPTION 'Expected existing exam tables are missing';
  END IF;
  IF to_regclass('public.meetings') IS NOT NULL OR to_regclass('public.exam_committees') IS NOT NULL OR EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND ((table_name = 'exams' AND column_name IN ('committeeId','grading','combinedStage')) OR (table_name = 'exam_requests' AND column_name = 'combinedStage'))
  ) THEN
    RAISE EXCEPTION 'School operations schema already exists; verify it instead of rerunning this script';
  END IF;
  IF to_regprocedure('public.capture_full_sync_hint()') IS NULL THEN
    RAISE EXCEPTION 'The full sync trigger function is missing; apply the base offline-sync database setup first';
  END IF;
END
$guard$;
CREATE TABLE "meetings" (
  "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "heldAt" TIMESTAMP(3) NOT NULL,
  "attendees" JSONB NOT NULL, "sections" JSONB NOT NULL, "notes" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "meetings_heldAt_idx" ON "meetings"("heldAt");
CREATE TABLE "exam_committees" (
  "id" TEXT PRIMARY KEY, "number" TEXT NOT NULL, "heldAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT NOT NULL, "members" JSONB NOT NULL, "notes" TEXT,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "exam_committees_number_key" ON "exam_committees"("number");
CREATE INDEX "exam_committees_heldAt_idx" ON "exam_committees"("heldAt");
ALTER TABLE "exams" ADD COLUMN "committeeId" TEXT, ADD COLUMN "grading" JSONB, ADD COLUMN "combinedStage" TEXT;
ALTER TABLE "exam_requests" ADD COLUMN "combinedStage" TEXT;
ALTER TABLE "exams" ALTER COLUMN "score" TYPE DOUBLE PRECISION;
ALTER TABLE "exam_milestone_records" ALTER COLUMN "score" TYPE DOUBLE PRECISION;
UPDATE "exam_sections" SET "minScore" = 80;
CREATE INDEX "exams_committeeId_idx" ON "exams"("committeeId");
ALTER TABLE "exams" ADD CONSTRAINT "exams_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "exam_committees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DO $$ DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['meetings','exam_committees','transfer_requests','suspension_requests'] LOOP
    IF to_regclass('public.' || table_name) IS NULL THEN RAISE EXCEPTION 'Expected sync table % is missing', table_name; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid WHERE t.tgrelid = to_regclass('public.' || table_name) AND NOT t.tgisinternal AND p.proname IN ('capture_full_sync_hint','capture_sync_change')) THEN
      EXECUTE format('CREATE TRIGGER full_sync_hint AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint()', table_name);
    END IF;
  END LOOP;
END $$;
COMMIT;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('meetings','exam_committees');
