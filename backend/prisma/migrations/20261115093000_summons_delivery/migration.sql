ALTER TABLE "guardian_summons" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "guardian_summons" ADD COLUMN "smsMessageId" TEXT;
CREATE INDEX "guardian_summons_smsMessageId_idx" ON "guardian_summons"("smsMessageId");
