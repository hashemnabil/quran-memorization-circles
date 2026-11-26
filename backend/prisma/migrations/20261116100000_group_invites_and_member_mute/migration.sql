ALTER TABLE "conversations" ADD COLUMN "inviteCode" TEXT;
CREATE UNIQUE INDEX "conversations_inviteCode_key" ON "conversations"("inviteCode");
ALTER TABLE "conversation_members" ADD COLUMN "isMuted" BOOLEAN NOT NULL DEFAULT false;
