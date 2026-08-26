-- ---------------------------------------------------------------------------
-- Username login, courses, points, staff directory, announcements.
--
-- Hand written so existing rows survive: usernames are derived from the old
-- e-mail identities, suspension requests keep their decided durations, and the
-- two enums that gained values are recreated rather than altered in place
-- (ALTER TYPE ... ADD VALUE cannot be used later in the same transaction, and
-- Prisma wraps every migration in one).
-- ---------------------------------------------------------------------------

-- 1 -------------------------------------------------------------- username --

ALTER TABLE "users" ADD COLUMN "username" TEXT;

-- Derive from the e-mail local part: strip anything that is not a letter or a
-- digit, then de-duplicate by appending a counter. Accounts with no e-mail at
-- all fall back to "user".
WITH base AS (
  SELECT
    "id",
    COALESCE(
      NULLIF(regexp_replace(lower(split_part("email", '@', 1)), '[^a-z0-9]', '', 'g'), ''),
      'user'
    ) AS stem,
    row_number() OVER (ORDER BY "createdAt", "id") AS seq
  FROM "users"
),
numbered AS (
  SELECT
    "id",
    stem,
    seq,
    row_number() OVER (PARTITION BY stem ORDER BY seq) AS dup
  FROM base
)
UPDATE "users" u
SET "username" = CASE WHEN n.dup = 1 THEN n.stem ELSE n.stem || n.dup::text END
FROM numbered n
WHERE u."id" = n."id";

ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- The e-mail is now optional contact information rather than the login.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- 2 ---------------------------------------------------- staff directory -----

ALTER TABLE "users" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "users" ADD COLUMN "specialization" TEXT;

-- 3 ------------------------------------------------------- enum: student ----

ALTER TYPE "StudentStatus" RENAME TO "StudentStatus_old";
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ACTIVITY', 'GRADUATED', 'WITHDRAWN');
ALTER TABLE "students" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "students" ALTER COLUMN "status" TYPE "StudentStatus" USING ("status"::text::"StudentStatus");
ALTER TABLE "students" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "StudentStatus_old";

-- 4 -------------------------------------------------- enum: notifications ---

ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
CREATE TYPE "NotificationType" AS ENUM (
  'TRANSFER_REQUEST', 'TRANSFER_DECISION', 'SUSPENSION_REQUEST', 'SUSPENSION_DECISION',
  'EXAM_REQUEST', 'EXAM_SCHEDULED', 'EXAM_RESULT', 'SUPPORT_TICKET', 'SUPPORT_REPLY',
  'CHAT_MESSAGE', 'ATTENDANCE', 'ANNOUNCEMENT', 'PREPARATION', 'COURSE', 'SYSTEM'
);
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType" USING ("type"::text::"NotificationType");
DROP TYPE "NotificationType_old";

-- 5 ------------------------------------------------------------ new enums ---

CREATE TYPE "SuspensionAction" AS ENUM ('ACTIVITY_PROGRAM', 'SUSPEND');
CREATE TYPE "CourseType" AS ENUM ('SHARIA', 'TAJWEED');
CREATE TYPE "ExamSectionKind" AS ENUM ('JUZ', 'HIZB');

-- 6 ----------------------------------------------------- recitation points --

ALTER TABLE "recitations" ADD COLUMN "versesCount" INTEGER;
ALTER TABLE "recitations" ADD COLUMN "mistakes"    INTEGER          NOT NULL DEFAULT 0;
ALTER TABLE "recitations" ADD COLUMN "warnings"    INTEGER          NOT NULL DEFAULT 0;
ALTER TABLE "recitations" ADD COLUMN "points"      DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "students"    ADD COLUMN "totalPoints" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Existing sessions have no mistake/warning history, so their score is simply
-- the number of ayat recited within a single surah. Cross-surah ranges are left
-- at zero rather than guessed at.
UPDATE "recitations"
SET "versesCount" = ("toAyah" - "fromAyah" + 1),
    "points"      = ("toAyah" - "fromAyah" + 1)
WHERE "fromSurah" = "toSurah" AND "toAyah" >= "fromAyah";

UPDATE "students" s
SET "totalPoints" = COALESCE(agg.total, 0)
FROM (
  SELECT "studentId", SUM("points") AS total
  FROM "recitations"
  WHERE "deletedAt" IS NULL
  GROUP BY "studentId"
) agg
WHERE s."id" = agg."studentId";

-- 7 ------------------------------------------------------ suspension flow ---

ALTER TABLE "suspension_requests" ADD COLUMN "action" "SuspensionAction";
ALTER TABLE "suspension_requests" ALTER COLUMN "durationDays" DROP NOT NULL;
ALTER TABLE "suspension_requests" ALTER COLUMN "startDate"    DROP NOT NULL;
ALTER TABLE "suspension_requests" ALTER COLUMN "endDate"      DROP NOT NULL;

-- Everything decided so far was a plain suspension; the activity programme is new.
UPDATE "suspension_requests" SET "action" = 'SUSPEND' WHERE "status" = 'APPROVED';

-- 8 ---------------------------------------------------------- exam scope ----

ALTER TABLE "exam_sections" ADD COLUMN "kind" "ExamSectionKind" NOT NULL DEFAULT 'JUZ';
CREATE INDEX "exam_sections_kind_idx" ON "exam_sections"("kind");

CREATE TABLE "exam_request_sections" (
  "id"        TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  CONSTRAINT "exam_request_sections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "exam_request_sections_requestId_sectionId_key" ON "exam_request_sections"("requestId", "sectionId");
CREATE INDEX "exam_request_sections_sectionId_idx" ON "exam_request_sections"("sectionId");
ALTER TABLE "exam_request_sections" ADD CONSTRAINT "exam_request_sections_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "exam_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_request_sections" ADD CONSTRAINT "exam_request_sections_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "exam_sections_on_exams" (
  "id"        TEXT NOT NULL,
  "examId"    TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  CONSTRAINT "exam_sections_on_exams_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "exam_sections_on_exams_examId_sectionId_key" ON "exam_sections_on_exams"("examId", "sectionId");
CREATE INDEX "exam_sections_on_exams_sectionId_idx" ON "exam_sections_on_exams"("sectionId");
ALTER TABLE "exam_sections_on_exams" ADD CONSTRAINT "exam_sections_on_exams_examId_fkey"
  FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_sections_on_exams" ADD CONSTRAINT "exam_sections_on_exams_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the new many-to-many from the single section every row already has,
-- so a multi-section read path returns the same answer for historical records.
INSERT INTO "exam_request_sections" ("id", "requestId", "sectionId")
SELECT gen_random_uuid()::text, "id", "sectionId" FROM "exam_requests";
INSERT INTO "exam_sections_on_exams" ("id", "examId", "sectionId")
SELECT gen_random_uuid()::text, "id", "sectionId" FROM "exams";

-- 9 ------------------------------------------------- support from the login --

ALTER TABLE "support_tickets" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "support_tickets" ADD COLUMN "contactName"  TEXT;
ALTER TABLE "support_tickets" ADD COLUMN "contactPhone" TEXT;
ALTER TABLE "support_tickets" ADD COLUMN "contactEmail" TEXT;

-- 10 ----------------------------------------------------------- courses -----

CREATE TABLE "courses" (
  "id"             TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "type"           "CourseType" NOT NULL,
  "description"    TEXT,
  "instructorName" TEXT,
  "instructorId"   TEXT,
  "location"       TEXT,
  "startDate"      DATE,
  "endDate"        DATE,
  "scheduleDays"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "startTime"      TEXT,
  "endTime"        TEXT,
  "capacity"       INTEGER NOT NULL DEFAULT 30,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");
CREATE INDEX "courses_type_idx" ON "courses"("type");
CREATE INDEX "courses_isActive_idx" ON "courses"("isActive");
CREATE INDEX "courses_instructorId_idx" ON "courses"("instructorId");
ALTER TABLE "courses" ADD CONSTRAINT "courses_instructorId_fkey"
  FOREIGN KEY ("instructorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "course_enrollments" (
  "id"         TEXT NOT NULL,
  "courseId"   TEXT NOT NULL,
  "studentId"  TEXT NOT NULL,
  "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"    TIMESTAMP(3),
  "note"       TEXT,
  CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "course_enrollments_courseId_studentId_key" ON "course_enrollments"("courseId", "studentId");
CREATE INDEX "course_enrollments_studentId_endedAt_idx" ON "course_enrollments"("studentId", "endedAt");
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "course_attendance" (
  "id"           TEXT NOT NULL,
  "courseId"     TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "date"         DATE NOT NULL,
  "status"       "AttendanceStatus" NOT NULL,
  "note"         TEXT,
  "recordedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "course_attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "course_attendance_courseId_studentId_date_key" ON "course_attendance"("courseId", "studentId", "date");
CREATE INDEX "course_attendance_courseId_date_idx" ON "course_attendance"("courseId", "date");
CREATE INDEX "course_attendance_studentId_date_idx" ON "course_attendance"("studentId", "date");
ALTER TABLE "course_attendance" ADD CONSTRAINT "course_attendance_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_attendance" ADD CONSTRAINT "course_attendance_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "course_attendance" ADD CONSTRAINT "course_attendance_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 11 ---------------------------------------------------- staff attendance ---

CREATE TABLE "staff_attendance" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "date"         DATE NOT NULL,
  "status"       "AttendanceStatus" NOT NULL,
  "note"         TEXT,
  "recordedById" TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "staff_attendance_userId_date_key" ON "staff_attendance"("userId", "date");
CREATE INDEX "staff_attendance_date_idx" ON "staff_attendance"("date");
CREATE INDEX "staff_attendance_userId_date_idx" ON "staff_attendance"("userId", "date");
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_attendance" ADD CONSTRAINT "staff_attendance_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 12 ------------------------------------------- preparation & surah points --

CREATE TABLE "preparation_assignments" (
  "id"          TEXT NOT NULL,
  "studentId"   TEXT NOT NULL,
  "teacherId"   TEXT NOT NULL,
  "fromSurah"   TEXT NOT NULL,
  "fromAyah"    INTEGER NOT NULL,
  "toSurah"     TEXT NOT NULL,
  "toAyah"      INTEGER NOT NULL,
  "note"        TEXT,
  "dueDate"     DATE,
  "completedAt" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "preparation_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "preparation_assignments_studentId_createdAt_idx" ON "preparation_assignments"("studentId", "createdAt");
CREATE INDEX "preparation_assignments_teacherId_createdAt_idx" ON "preparation_assignments"("teacherId", "createdAt");
ALTER TABLE "preparation_assignments" ADD CONSTRAINT "preparation_assignments_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "preparation_assignments" ADD CONSTRAINT "preparation_assignments_teacherId_fkey"
  FOREIGN KEY ("teacherId") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "surah_completions" (
  "id"           TEXT NOT NULL,
  "studentId"    TEXT NOT NULL,
  "surah"        TEXT NOT NULL,
  "points"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"         TEXT,
  "completedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT NOT NULL,
  CONSTRAINT "surah_completions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "surah_completions_studentId_surah_key" ON "surah_completions"("studentId", "surah");
CREATE INDEX "surah_completions_studentId_completedAt_idx" ON "surah_completions"("studentId", "completedAt");
ALTER TABLE "surah_completions" ADD CONSTRAINT "surah_completions_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "surah_completions" ADD CONSTRAINT "surah_completions_recordedById_fkey"
  FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 13 ------------------------------------------------------ announcements ----

CREATE TABLE "announcements" (
  "id"          TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "body"        TEXT,
  "link"        TEXT,
  "audience"    "Role"[] DEFAULT ARRAY[]::"Role"[],
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"   TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "announcements_isActive_publishedAt_idx" ON "announcements"("isActive", "publishedAt");
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
