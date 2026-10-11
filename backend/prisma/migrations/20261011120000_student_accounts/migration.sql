-- Add the STUDENT role and link each student profile to a login account.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STUDENT';
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "userId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "students_userId_key" ON "students"("userId");
DO $$ BEGIN
  ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT FALSE;
