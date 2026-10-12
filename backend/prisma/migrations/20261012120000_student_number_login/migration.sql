-- Make the generated student number the login username for existing student accounts.
-- Abort with a clear message if a staff/other account already owns one of these usernames.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM students s
    JOIN users student_user ON student_user.id = s."userId"
    JOIN users other_user ON lower(other_user.username) = lower(s.code)
      AND other_user.id <> student_user.id
    WHERE s."userId" IS NOT NULL
      AND student_user.role = 'STUDENT'
  ) THEN
    RAISE EXCEPTION 'Cannot migrate student usernames: at least one generated student number is already used by another account. Resolve the username conflict, then rerun the migration.';
  END IF;
END $$;

UPDATE users u
SET username = lower(s.code)
FROM students s
WHERE s."userId" = u.id
  AND u.role = 'STUDENT'
  AND u.username <> lower(s.code);
