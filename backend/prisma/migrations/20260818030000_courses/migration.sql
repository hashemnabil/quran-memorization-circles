-- Independent course system, separate from memorization circles.
CREATE TYPE "CourseType" AS ENUM ('SHARIA', 'TAJWEED');
CREATE TYPE "CourseEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

CREATE TABLE "courses" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "type" "CourseType" NOT NULL,
  "start_date" TIMESTAMP(3),
  "end_date" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "course_circles" (
  "id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "location" TEXT,
  "capacity" INTEGER NOT NULL DEFAULT 25,
  "schedule_days" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "start_time" TEXT,
  "end_time" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_circles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_circles_code_key" UNIQUE ("code"),
  CONSTRAINT "course_circles_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "course_teachers" (
  "id" TEXT NOT NULL,
  "course_circle_id" TEXT NOT NULL,
  "teacher_id" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_teachers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_teachers_circle_fkey" FOREIGN KEY ("course_circle_id") REFERENCES "course_circles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "course_teachers_teacher_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "course_enrollments" (
  "id" TEXT NOT NULL,
  "course_id" TEXT NOT NULL,
  "course_circle_id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "status" "CourseEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "completion_note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_enrollments_course_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "course_enrollments_circle_fkey" FOREIGN KEY ("course_circle_id") REFERENCES "course_circles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "course_enrollments_student_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "courses_type_idx" ON "courses"("type");
CREATE INDEX "course_circles_course_id_idx" ON "course_circles"("course_id");
CREATE INDEX "course_teachers_teacher_id_idx" ON "course_teachers"("teacher_id", "ended_at");
CREATE INDEX "course_enrollments_student_id_idx" ON "course_enrollments"("student_id");
CREATE INDEX "course_enrollments_course_id_idx" ON "course_enrollments"("course_id");
CREATE INDEX "course_enrollments_status_idx" ON "course_enrollments"("status");
