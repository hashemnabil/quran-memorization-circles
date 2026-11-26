ALTER TABLE "absence_permission_requests" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "absence_permission_requests" ADD COLUMN "endDate" DATE;
ALTER TABLE "absence_permission_requests" ADD COLUMN "note" TEXT;
-- Preserve existing requests, including their historical duration in days.
UPDATE "absence_permission_requests"
SET "endDate" = "date" + (GREATEST("durationMinutes", 1) - 1);
CREATE INDEX "absence_permission_requests_requesterId_date_idx"
ON "absence_permission_requests" ("requesterId", "date");
-- Rejected requests remain in history and can be followed by a corrected request.
-- Active overlapping periods are serialized and checked by requester in the service.
DROP INDEX "absence_permission_requests_studentId_date_key";
CREATE INDEX "absence_permission_requests_studentId_date_idx"
ON "absence_permission_requests" ("studentId", "date");
