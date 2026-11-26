CREATE TABLE "media_plans" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "day" TEXT NOT NULL,
  "activity" TEXT NOT NULL,
  "idea" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_plans_date_idx" ON "media_plans"("date");

CREATE TABLE "teacher_duties" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "day" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teacher_duties_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "teacher_duties_date_idx" ON "teacher_duties"("date");

CREATE TABLE "teacher_duty_assignments" (
  "id" TEXT NOT NULL,
  "dutyId" TEXT NOT NULL,
  "teacherUserId" TEXT NOT NULL,
  "assignedNotifiedAt" TIMESTAMP(3),
  "dayBeforeNotifiedAt" TIMESTAMP(3),
  "morningNotifiedAt" TIMESTAMP(3),
  CONSTRAINT "teacher_duty_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teacher_duty_assignments_dutyId_teacherUserId_key" ON "teacher_duty_assignments"("dutyId", "teacherUserId");
CREATE INDEX "teacher_duty_assignments_teacherUserId_idx" ON "teacher_duty_assignments"("teacherUserId");
ALTER TABLE "teacher_duty_assignments" ADD CONSTRAINT "teacher_duty_assignments_dutyId_fkey" FOREIGN KEY ("dutyId") REFERENCES "teacher_duties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
