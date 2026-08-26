-- A third outcome for a suspension request: a permanent stop.
--
-- The school sometimes has to end a student's enrolment outright rather than
-- pause it or move them to the activity programme. The student's whole record
-- stays in the unified register — that is the point of the register — but they
-- leave their circle and carry no end date, so nothing brings them back
-- automatically.
--
-- The enum is recreated rather than extended: `ALTER TYPE ... ADD VALUE` cannot
-- be used later in the same transaction, and Prisma wraps a migration in one.
ALTER TYPE "SuspensionAction" RENAME TO "SuspensionAction_old";

CREATE TYPE "SuspensionAction" AS ENUM ('ACTIVITY_PROGRAM', 'SUSPEND', 'PERMANENT');

ALTER TABLE "suspension_requests"
  ALTER COLUMN "action" TYPE "SuspensionAction"
  USING ("action"::text::"SuspensionAction");

DROP TYPE "SuspensionAction_old";
