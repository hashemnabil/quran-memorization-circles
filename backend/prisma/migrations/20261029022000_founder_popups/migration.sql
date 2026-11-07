ALTER TABLE "announcements" ADD COLUMN "isPopup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "announcements" ADD COLUMN "popup" JSONB;
CREATE TABLE "announcement_receipts" (
  "id" TEXT PRIMARY KEY, "announcementId" TEXT NOT NULL,
  "subject" TEXT NOT NULL, "kind" TEXT NOT NULL, "eventKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "announcement_receipts_announcementId_subject_kind_eventKey_key"
  ON "announcement_receipts"("announcementId", "subject", "kind", "eventKey");
CREATE INDEX "announcement_receipts_announcementId_kind_idx" ON "announcement_receipts"("announcementId", "kind");
