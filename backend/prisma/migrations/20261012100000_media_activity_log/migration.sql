CREATE TYPE "MediaActivityType" AS ENUM ('REPORT_FILLING', 'PHOTOGRAPHY', 'PUBLISHING', 'EDITING', 'DESIGN');

CREATE TABLE "media_activities" (
  "id" TEXT NOT NULL,
  "type" "MediaActivityType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "activityDate" DATE NOT NULL,
  "workUrl" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "media_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "media_activities_activityDate_idx" ON "media_activities"("activityDate");
CREATE INDEX "media_activities_type_activityDate_idx" ON "media_activities"("type", "activityDate");
ALTER TABLE "media_activities" ADD CONSTRAINT "media_activities_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
