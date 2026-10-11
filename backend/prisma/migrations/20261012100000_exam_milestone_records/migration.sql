CREATE TYPE "ExamMilestoneStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'SCHEDULED', 'COMPLETED');

CREATE TABLE "exam_milestone_records" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "sectionId" TEXT NOT NULL,
  "status" "ExamMilestoneStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "score" INTEGER,
  "requestedAt" TIMESTAMP(3),
  "examDate" TIMESTAMP(3),
  "examinerName" TEXT,
  "note" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exam_milestone_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_milestone_records_studentId_sectionId_key"
  ON "exam_milestone_records"("studentId", "sectionId");
CREATE INDEX "exam_milestone_records_studentId_status_idx"
  ON "exam_milestone_records"("studentId", "status");

ALTER TABLE "exam_milestone_records"
  ADD CONSTRAINT "exam_milestone_records_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_milestone_records"
  ADD CONSTRAINT "exam_milestone_records_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "exam_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
