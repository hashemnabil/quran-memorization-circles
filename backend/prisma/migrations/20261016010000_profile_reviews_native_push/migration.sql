CREATE TABLE "profile_reviews" (
  "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "subjectId" TEXT NOT NULL, "requesterId" TEXT NOT NULL,
  "patch" JSONB NOT NULL, "base" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reason" TEXT, "reviewedById" TEXT, "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "profile_reviews_requesterId_createdAt_idx" ON "profile_reviews"("requesterId", "createdAt");
CREATE INDEX "profile_reviews_kind_status_createdAt_idx" ON "profile_reviews"("kind", "status", "createdAt");
CREATE UNIQUE INDEX "profile_reviews_one_pending" ON "profile_reviews"("requesterId") WHERE "status" = 'PENDING';
ALTER TABLE "notifications" ADD COLUMN "pushQueuedAt" TIMESTAMP(3);
CREATE INDEX "notifications_pushQueuedAt_createdAt_idx" ON "notifications"("pushQueuedAt", "createdAt");
CREATE TABLE "push_devices" (
  "id" TEXT PRIMARY KEY, "installationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "platform" TEXT NOT NULL,
  "token" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "push_devices_installationId_key" ON "push_devices"("installationId");
CREATE UNIQUE INDEX "push_devices_token_key" ON "push_devices"("token");
CREATE INDEX "push_devices_userId_enabled_idx" ON "push_devices"("userId", "enabled");
CREATE TABLE "push_deliveries" (
  "id" TEXT PRIMARY KEY, "notificationId" TEXT NOT NULL, "deviceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "push_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "push_deliveries_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "push_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "push_deliveries_notificationId_deviceId_key" ON "push_deliveries"("notificationId", "deviceId");
CREATE INDEX "push_deliveries_status_nextAttemptAt_idx" ON "push_deliveries"("status", "nextAttemptAt");
