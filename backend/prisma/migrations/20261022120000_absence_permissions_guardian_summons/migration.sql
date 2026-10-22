CREATE TABLE "absence_permission_requests" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "absence_permission_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "absence_permission_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "absence_permission_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "absence_permission_requests_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "absence_permission_requests_studentId_date_key" ON "absence_permission_requests"("studentId", "date");
CREATE INDEX "absence_permission_requests_status_date_idx" ON "absence_permission_requests"("status", "date");
CREATE INDEX "absence_permission_requests_requesterId_createdAt_idx" ON "absence_permission_requests"("requesterId", "createdAt");
CREATE TABLE "guardian_summons" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "issuedById" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardian_summons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "guardian_summons_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "guardian_summons_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "guardian_summons_studentId_createdAt_idx" ON "guardian_summons"("studentId", "createdAt");
DO $$ BEGIN
  IF to_regprocedure('public.capture_full_sync_hint()') IS NOT NULL THEN
    CREATE TRIGGER full_sync_hint AFTER INSERT OR UPDATE OR DELETE ON "absence_permission_requests" FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint();
    CREATE TRIGGER full_sync_hint AFTER INSERT OR UPDATE OR DELETE ON "guardian_summons" FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint();
  END IF;
END $$;
