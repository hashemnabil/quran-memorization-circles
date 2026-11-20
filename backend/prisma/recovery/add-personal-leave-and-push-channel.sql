-- For the existing unmanaged public schema (Prisma P3005).
-- Apply the WHOLE file in Neon SQL Editor on the application's database branch.
-- Does not mark migrations as applied; migration history still needs an audited baseline.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = public, pg_catalog;

DO $guard$
BEGIN
  IF to_regclass('public.absence_permission_requests') IS NULL
     OR to_regclass('public.push_devices') IS NULL THEN
    RAISE EXCEPTION 'Expected application tables are missing. Check the selected database branch.';
  END IF;
END
$guard$;

ALTER TABLE public.push_devices
  ADD COLUMN IF NOT EXISTS "notificationChannelId" VARCHAR(80),
  ADD COLUMN IF NOT EXISTS "hidePreview" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.absence_permission_requests
  ALTER COLUMN "studentId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "endDate" DATE,
  ADD COLUMN IF NOT EXISTS "note" TEXT;

-- Same historical conversion as 20261028200000_self_absence_period.
-- Existing end dates survive retries unchanged.
UPDATE public.absence_permission_requests
SET "endDate" = "date" + (GREATEST("durationMinutes", 1) - 1)
WHERE "endDate" IS NULL;

CREATE INDEX IF NOT EXISTS "absence_permission_requests_requesterId_date_idx"
  ON public.absence_permission_requests ("requesterId", "date");
-- Keep rejected requests in history while allowing corrected submissions.
-- The API serializes and validates active overlapping periods per requester.
DROP INDEX IF EXISTS public."absence_permission_requests_studentId_date_key";
CREATE INDEX IF NOT EXISTS "absence_permission_requests_studentId_date_idx"
  ON public.absence_permission_requests ("studentId", "date");

COMMIT;

-- Expect endDate/date, note/text, notificationChannelId/character varying.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'absence_permission_requests' AND column_name IN ('studentId', 'durationMinutes', 'endDate', 'note'))
    OR (table_name = 'push_devices' AND column_name IN ('notificationChannelId', 'hidePreview')))
ORDER BY table_name, column_name;
