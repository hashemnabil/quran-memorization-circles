CREATE TABLE "founder_assets" (
  "id" TEXT PRIMARY KEY,
  "title" VARCHAR(100) NOT NULL,
  "kind" VARCHAR(30) NOT NULL,
  "mime" VARCHAR(40) NOT NULL,
  "content" BYTEA NOT NULL,
  "size" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "founder_assets_kind_isActive_idx" ON "founder_assets"("kind", "isActive");
