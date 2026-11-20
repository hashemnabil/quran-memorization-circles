CREATE TABLE "memorization_plans" (
  "id" TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "createdById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "title" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "target" DOUBLE PRECISION NOT NULL CHECK ("target" > 0),
  "completed" DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK ("completed" >= 0 AND "completed" <= "target"),
  "archived" BOOLEAN NOT NULL DEFAULT false,
  "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "memorization_plans_studentId_idx" ON "memorization_plans"("studentId");
CREATE TABLE "memorization_progress" (
  "id" TEXT PRIMARY KEY,
  "planId" TEXT NOT NULL REFERENCES "memorization_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "recordedById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DOUBLE PRECISION NOT NULL CHECK ("amount" > 0),
  "note" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "memorization_progress_planId_idx" ON "memorization_progress"("planId");
