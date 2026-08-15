-- ---------------------------------------------------------------------------
-- Simplification pass: email login, three attendance states, recitation without
-- numeric grading, optional mistake count on exams.
--
-- Written by hand rather than generated so the existing rows are migrated
-- instead of dropped.
-- ---------------------------------------------------------------------------

-- 1. Login identity moves from `username` to `email` -------------------------

-- Normalise what is already there.
UPDATE "users" SET "email" = lower(btrim("email")) WHERE "email" IS NOT NULL;

-- Release duplicates, keeping the address for the account that had it first.
UPDATE "users" u
SET "email" = NULL
WHERE u."email" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "users" o
    WHERE o."email" = u."email" AND o."createdAt" < u."createdAt"
  );

-- Anyone left without an address gets one derived from their (unique) username,
-- so no account is locked out by the change.
UPDATE "users"
SET "email" = lower("username") || '@qcircles.local'
WHERE "email" IS NULL OR "email" = '';

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

DROP INDEX IF EXISTS "users_username_key";
ALTER TABLE "users" DROP COLUMN "username";

-- Existing accounts are treated as already verified; only new ones must confirm.
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "users" SET "emailVerifiedAt" = CURRENT_TIMESTAMP;

-- 2. Attendance: drop the "late" state and its minute counter ----------------

UPDATE "attendance" SET "status" = 'PRESENT' WHERE "status" = 'LATE';

ALTER TYPE "AttendanceStatus" RENAME TO "AttendanceStatus_old";
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'EXCUSED');
ALTER TABLE "attendance"
  ALTER COLUMN "status" TYPE "AttendanceStatus"
  USING ("status"::text::"AttendanceStatus");
DROP TYPE "AttendanceStatus_old";

ALTER TABLE "attendance" DROP COLUMN "minutesLate";

-- 3. Daily recitation keeps the evaluation only ------------------------------

ALTER TABLE "recitations" DROP COLUMN "score";
ALTER TABLE "recitations" DROP COLUMN "mistakes";

-- 4. Exams may record a mistake count, but never have to ---------------------

ALTER TABLE "exams" ADD COLUMN "mistakes" INTEGER;
