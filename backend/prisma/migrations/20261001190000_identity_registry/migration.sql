CREATE TABLE "registry_users" (
  "id" TEXT NOT NULL,
  "nationalId" TEXT NOT NULL,
  "fullName" TEXT,
  "phone" TEXT,
  "email" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "gender" "Gender",
  "city" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "registry_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "registry_users_nationalId_key" ON "registry_users"("nationalId");
CREATE INDEX "registry_users_fullName_idx" ON "registry_users"("fullName");
CREATE INDEX "registry_users_completed_isActive_idx" ON "registry_users"("completed", "isActive");
