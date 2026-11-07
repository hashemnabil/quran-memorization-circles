ALTER TABLE "CommunityStory" ADD COLUMN "schoolStory" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "CommunityStoryReply" ("id" TEXT NOT NULL, "storyId" TEXT NOT NULL, "userId" TEXT NOT NULL, "body" VARCHAR(500) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CommunityStoryReply_pkey" PRIMARY KEY ("id"));
CREATE INDEX "CommunityStoryReply_storyId_createdAt_idx" ON "CommunityStoryReply"("storyId","createdAt");
ALTER TABLE "CommunityStoryReply" ADD CONSTRAINT "CommunityStoryReply_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "CommunityStory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityStoryReply" ADD CONSTRAINT "CommunityStoryReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
