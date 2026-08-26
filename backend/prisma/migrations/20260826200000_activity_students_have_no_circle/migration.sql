-- A student in the activity programme belongs to no circle. That is what the
-- programme *is*: they are on the school's books, following courses if they
-- wish, but not attending a memorization circle until they are ready.
--
-- The transfer path always cleared the circle, but the student form could set
-- the status directly and left `circleId` in place, so activity students kept
-- turning up on circle rosters.

-- 1. Close any membership still open for a student already in the programme.
UPDATE "circle_memberships" cm
SET "endedAt" = now(),
    "reason"  = 'التحويل إلى برنامج النشاط'
FROM "students" s
WHERE cm."studentId" = s."id"
  AND cm."endedAt" IS NULL
  AND s."status" = 'ACTIVITY';

-- 2. Detach them from the circle itself.
UPDATE "students"
SET "circleId" = NULL
WHERE "status" = 'ACTIVITY'
  AND "circleId" IS NOT NULL;

-- 3. Make it impossible to say otherwise again, from any code path at all.
--    Prisma does not model CHECK constraints, so this lives only in the
--    migration: `migrate deploy` keeps it, and a future `migrate dev` would
--    report it as drift -- re-add it there rather than dropping it.
ALTER TABLE "students"
  ADD CONSTRAINT "students_activity_has_no_circle"
  CHECK ("status" <> 'ACTIVITY' OR "circleId" IS NULL);
