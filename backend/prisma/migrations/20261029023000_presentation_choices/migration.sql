CREATE TABLE "presentation_choices" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "assetId" TEXT, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "presentation_choices_userId_kind_key" ON "presentation_choices"("userId", "kind");
