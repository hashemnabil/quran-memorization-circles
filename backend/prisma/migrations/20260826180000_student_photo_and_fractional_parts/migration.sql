-- Two changes to the student record.

-- 1. The memorization total is derived from the ahzab passed, and an exam may
--    cover an odd number of them. As an integer, five ahzab read as "2 juz'"
--    and a single hizb as "0" -- half a juz' of real work rounded away each
--    time. Widening to a float keeps the halves; existing whole numbers are
--    unaffected by the cast.
ALTER TABLE "students"
  ALTER COLUMN "memorizedParts" TYPE DOUBLE PRECISION USING "memorizedParts"::double precision;

-- 2. A picture for the student. They have no account of their own, so it is set
--    by the school or by their guardian from the parent portal.
ALTER TABLE "students" ADD COLUMN "photoUrl" TEXT;
