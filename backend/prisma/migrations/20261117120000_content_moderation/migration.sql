CREATE TYPE "ModerationTargetType" AS ENUM ('POST', 'COMMENT', 'STORY', 'MESSAGE');
CREATE TYPE "ModerationReportStatus" AS ENUM ('PENDING', 'RESOLVED', 'DISMISSED');
CREATE TYPE "ModerationActionType" AS ENUM ('KEEP', 'REMOVE', 'WARN');

CREATE TABLE "moderation_reports" (
  "id" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "targetType" "ModerationTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" VARCHAR(40) NOT NULL,
  "details" VARCHAR(500),
  "status" "ModerationReportStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_reports_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "moderation_actions" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" "ModerationActionType" NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "moderation_reports_reporterId_targetType_targetId_key" ON "moderation_reports"("reporterId", "targetType", "targetId");
CREATE INDEX "moderation_reports_status_createdAt_idx" ON "moderation_reports"("status", "createdAt");
CREATE INDEX "moderation_reports_targetType_targetId_idx" ON "moderation_reports"("targetType", "targetId");
CREATE INDEX "moderation_actions_reportId_createdAt_idx" ON "moderation_actions"("reportId", "createdAt");
CREATE INDEX "moderation_actions_actorId_createdAt_idx" ON "moderation_actions"("actorId", "createdAt");
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moderation_reports" ADD CONSTRAINT "moderation_reports_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "moderation_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
