CREATE TABLE "sms_campaigns" (
 "id" TEXT PRIMARY KEY, "requestKey" TEXT NOT NULL UNIQUE,
 "requestHash" TEXT NOT NULL, "createdById" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "sms_messages" (
 "id" TEXT PRIMARY KEY, "campaignId" TEXT NOT NULL REFERENCES "sms_campaigns"("id") ON DELETE CASCADE,
 "phone" TEXT NOT NULL, "title" TEXT NOT NULL, "encryptedText" TEXT NOT NULL, "credential" BOOLEAN NOT NULL DEFAULT false,
 "status" TEXT NOT NULL DEFAULT 'QUEUED', "attempts" INTEGER NOT NULL DEFAULT 0,
 "errorCode" TEXT, "claimedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "sms_messages_status_updatedAt_idx" ON "sms_messages"("status", "updatedAt");
CREATE INDEX "sms_messages_campaignId_idx" ON "sms_messages"("campaignId");
CREATE TABLE "sms_templates" ("kind" TEXT PRIMARY KEY, "text" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
