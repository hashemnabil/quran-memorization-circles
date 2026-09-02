BEGIN;

-- Add enum value STUDENT to Role if missing
DO $$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'Role' AND e.enumlabel = 'STUDENT'
  ) THEN
    ALTER TYPE "Role" ADD VALUE 'STUDENT';
  END IF;
END$$;

-- Remove parent reference columns from students (try both naming variants)
ALTER TABLE IF EXISTS students DROP CONSTRAINT IF EXISTS students_parentid_fkey;
ALTER TABLE IF EXISTS students DROP CONSTRAINT IF EXISTS students_parent_id_fkey;

ALTER TABLE IF EXISTS students DROP COLUMN IF EXISTS "parentId";
ALTER TABLE IF EXISTS students DROP COLUMN IF EXISTS parent_id;

-- Drop parent_profiles table (archived separately)
DROP TABLE IF EXISTS parent_profiles CASCADE;

-- Ensure unique index on students.userId if the column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name='students' AND lower(column_name)='userid'
  ) THEN
    BEGIN
      CREATE UNIQUE INDEX IF NOT EXISTS students_userid_key ON students ("userId");
    EXCEPTION WHEN duplicate_table THEN
      -- ignore
    END;
  END IF;
END$$;

COMMIT;
