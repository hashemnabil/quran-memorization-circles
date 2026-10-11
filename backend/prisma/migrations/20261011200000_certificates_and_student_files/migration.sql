CREATE TYPE "CertificateKind" AS ENUM ('JUZ_COMPLETION','QURAN_COMPLETION','TAJWEED_COURSE','SHARIA_COURSE','COURSE_COMPLETION','HONOR');
CREATE TYPE "StudentFileRequestKind" AS ENUM ('CERTIFICATE','MONTHLY_REPORT');
CREATE TYPE "StudentFileRequestStatus" AS ENUM ('PENDING','APPROVED','REJECTED','READY');

CREATE TABLE "certificate_templates" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "CertificateKind" NOT NULL,
  "sourceType" TEXT NOT NULL,
  "fileUrl" TEXT,
  "design" JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "certificate_templates_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "certificate_records" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "templateId" TEXT,
  "kind" "CertificateKind" NOT NULL,
  "title" TEXT NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "fileUrl" TEXT NOT NULL,
  "issuedById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "certificate_records_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "student_file_requests" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "kind" "StudentFileRequestKind" NOT NULL,
  "certificateKind" "CertificateKind",
  "courseName" TEXT,
  "periodFrom" DATE,
  "periodTo" DATE,
  "status" "StudentFileRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestNote" TEXT,
  "decisionNote" TEXT,
  "reportDraft" JSONB,
  "fileUrl" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_file_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "certificate_templates_kind_isActive_idx" ON "certificate_templates"("kind","isActive");
CREATE INDEX "certificate_records_studentId_issuedAt_idx" ON "certificate_records"("studentId","issuedAt");
CREATE INDEX "certificate_records_kind_idx" ON "certificate_records"("kind");
CREATE INDEX "student_file_requests_studentId_createdAt_idx" ON "student_file_requests"("studentId","createdAt");
CREATE INDEX "student_file_requests_status_kind_idx" ON "student_file_requests"("status","kind");

ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificate_records" ADD CONSTRAINT "certificate_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certificate_records" ADD CONSTRAINT "certificate_records_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "certificate_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "certificate_records" ADD CONSTRAINT "certificate_records_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_file_requests" ADD CONSTRAINT "student_file_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_file_requests" ADD CONSTRAINT "student_file_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
