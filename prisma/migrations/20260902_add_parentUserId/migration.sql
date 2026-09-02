-- Prisma migration: add students.parentUserId (nullable FK to users), create index
BEGIN;

ALTER TABLE students ADD COLUMN IF NOT EXISTS "parentUserId" uuid;

-- Create index for lookups by parentUserId
CREATE INDEX IF NOT EXISTS idx_students_parentUserId ON students ("parentUserId");

COMMIT;
