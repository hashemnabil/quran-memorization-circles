-- Students converted to activities leave their memorization circle but remain
-- in the school's historical student register.
CREATE TABLE "student_activity_status" (
  "student_id" TEXT NOT NULL,
  "reason" TEXT,
  "converted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "converted_by_id" TEXT,
  CONSTRAINT "student_activity_status_pkey" PRIMARY KEY ("student_id"),
  CONSTRAINT "student_activity_status_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "student_activity_status_converted_by_id_fkey"
    FOREIGN KEY ("converted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "student_activity_status_converted_at_idx"
  ON "student_activity_status"("converted_at");
