-- Target: existing unmanaged public schema with 39 application tables.
-- Adds six missing tables and journal triggers. No baseline markers, seeds or resets.
-- Run the entire file once in Neon SQL Editor on the application's database branch.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SET LOCAL search_path = public, pg_catalog;
DO $guard$
DECLARE name TEXT;
BEGIN
  FOREACH name IN ARRAY ARRAY['students','users','circles','attendance','exam_milestone_records','media_activities','certificate_records'] LOOP
    IF to_regclass('public.' || name) IS NULL THEN
      RAISE EXCEPTION 'Expected application table % is missing. Stop and check the selected database branch.', name;
    END IF;
  END LOOP;
  FOREACH name IN ARRAY ARRAY['registry_users','sync_changes','processed_operations','media_plans','teacher_duties','teacher_duty_assignments'] LOOP
    IF to_regclass('public.' || name) IS NOT NULL THEN
      RAISE EXCEPTION 'Recovery target % already exists. Stop; do not rerun or delete tables.', name;
    END IF;
  END LOOP;
END;
$guard$;

-- Source: 20261001190000_identity_registry
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


-- Source: 20261014090000_general_sync_journal
-- Durable global sequence for incremental sync. Internal/authentication tables
-- are intentionally excluded: sync logs must never become a credential archive.
CREATE TABLE "sync_changes" (
  "seq" BIGSERIAL PRIMARY KEY,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('UPSERT', 'DELETE')),
  "payload" JSONB,
  "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "sync_changes_entity_entityId_seq_idx"
  ON "sync_changes" ("entity", "entityId", "seq");

CREATE TABLE "processed_operations" (
  "opId" VARCHAR(128) NOT NULL,
  "accountId" TEXT NOT NULL,
  "result" JSONB,
  "processedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("opId", "accountId")
);
CREATE INDEX "processed_operations_accountId_processedAt_idx"
  ON "processed_operations" ("accountId", "processedAt");

-- Use a conservative table allowlist, not "all tables": audit/auth/session/token
-- data and internal sync tables are never replicated. Per-entity API allowlists
-- remain mandatory even though sensitive keys are stripped here as defense in depth.
CREATE OR REPLACE FUNCTION capture_sync_change() RETURNS trigger AS $$
DECLARE
  row_data JSONB;
  row_id TEXT;
  table_entity TEXT;
  is_deleted BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;

  row_id := row_data ->> 'id';
  IF row_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Never persist credential, token, or secret fields in the generic journal.
  row_data := row_data
    - 'password' - 'passwordHash' - 'hashedPassword' - 'token'
    - 'accessToken' - 'refreshToken' - 'secret' - 'privateKey'
    - 'resetToken' - 'verificationToken';

  table_entity := TG_TABLE_NAME;
  is_deleted := TG_OP = 'DELETE' OR COALESCE(row_data ->> 'deletedAt', '') <> '';

  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (table_entity, row_id, CASE WHEN is_deleted THEN 'DELETE' ELSE 'UPSERT' END,
          CASE WHEN is_deleted THEN NULL ELSE row_data END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Explicit data-table allowlist; excludes users, registry identity, auth,
-- tokens, sessions, messages, audit logs, and the journal itself.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name IN (
        'circles', 'students', 'attendance', 'recitations',
        'student_evaluations', 'student_notes', 'preparations',
        'announcements', 'courses', 'course_enrollments',
        'exams', 'exam_requests', 'transfers', 'transfer_requests',
        'suspension_requests', 'certificates', 'certificate_records',
        'student_file_requests', 'staff_attendance'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS sync_change_capture ON %I', t.table_name);
    EXECUTE format(
      'CREATE TRIGGER sync_change_capture AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_sync_change()',
      t.table_name
    );
  END LOOP;
END $$;


-- Source: 20261014130000_commit_ordered_sync_journal
-- Additive journal-policy change; no data tables or existing receipts are rewritten.
CREATE OR REPLACE FUNCTION capture_sync_change() RETURNS trigger AS $$
DECLARE
  row_data JSONB;
  row_id TEXT;
  table_entity TEXT;
  is_deleted BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_data := to_jsonb(OLD);
  ELSE
    row_data := to_jsonb(NEW);
  END IF;

  row_id := row_data ->> 'id';
  IF row_id IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Never persist credential, token, or secret fields in the generic journal.
  row_data := row_data
    - 'password' - 'passwordHash' - 'hashedPassword' - 'token'
    - 'accessToken' - 'refreshToken' - 'secret' - 'privateKey'
    - 'resetToken' - 'verificationToken';

  table_entity := TG_TABLE_NAME;
  is_deleted := TG_OP = 'DELETE' OR COALESCE(row_data ->> 'deletedAt', '') <> '';

  -- Allocate the sequence only after the journal lock is held. This prevents
  -- a later seq committing first and making clients skip an earlier transaction.
  PERFORM pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0);

  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (table_entity, row_id, CASE WHEN is_deleted THEN 'DELETE' ELSE 'UPSERT' END,
          CASE WHEN is_deleted THEN jsonb_build_object(
            'id', row_id, 'circleId', row_data -> 'circleId',
            'parentId', row_data -> 'parentId', 'userId', row_data -> 'userId'
          ) ELSE row_data END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;



-- Source: 20261014220000_media_teacher_duty_tables
CREATE TABLE "media_plans" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "day" TEXT NOT NULL,
  "activity" TEXT NOT NULL,
  "idea" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "media_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "media_plans_date_idx" ON "media_plans"("date");

CREATE TABLE "teacher_duties" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "day" TEXT NOT NULL,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "teacher_duties_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "teacher_duties_date_idx" ON "teacher_duties"("date");

CREATE TABLE "teacher_duty_assignments" (
  "id" TEXT NOT NULL,
  "dutyId" TEXT NOT NULL,
  "teacherUserId" TEXT NOT NULL,
  "assignedNotifiedAt" TIMESTAMP(3),
  "dayBeforeNotifiedAt" TIMESTAMP(3),
  "morningNotifiedAt" TIMESTAMP(3),
  CONSTRAINT "teacher_duty_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teacher_duty_assignments_dutyId_teacherUserId_key" ON "teacher_duty_assignments"("dutyId", "teacherUserId");
CREATE INDEX "teacher_duty_assignments_teacherUserId_idx" ON "teacher_duty_assignments"("teacherUserId");
ALTER TABLE "teacher_duty_assignments" ADD CONSTRAINT "teacher_duty_assignments_dutyId_fkey" FOREIGN KEY ("dutyId") REFERENCES "teacher_duties"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Source: 20261015120000_incremental_full_sync
-- Keep relationship IDs in tombstones so dependent offline projections refresh.
CREATE OR REPLACE FUNCTION capture_sync_change() RETURNS trigger AS $$
DECLARE row_data JSONB; previous_data JSONB; row_id TEXT; deleted BOOLEAN;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id := row_data ->> 'id';
  IF row_id IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  previous_data := CASE WHEN TG_OP = 'UPDATE' THEN jsonb_build_object('circleId', to_jsonb(OLD)->'circleId') ELSE NULL END;
  row_data := row_data - 'password' - 'passwordHash' - 'hashedPassword' - 'token'
    - 'accessToken' - 'refreshToken' - 'secret' - 'privateKey' - 'resetToken' - 'verificationToken';
  deleted := TG_OP = 'DELETE' OR COALESCE(row_data ->> 'deletedAt', '') <> '';
  PERFORM pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0);
  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (TG_TABLE_NAME, row_id, CASE WHEN deleted THEN 'DELETE' ELSE 'UPSERT' END,
    CASE WHEN deleted THEN jsonb_build_object('id', row_id,
      'studentId', row_data->'studentId', 'circleId', row_data->'circleId',
      'parentId', row_data->'parentId', 'userId', row_data->'userId',
      'teacherId', row_data->'teacherId', 'courseId', row_data->'courseId')
    ELSE row_data || jsonb_build_object('_previous', previous_data) END);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

-- Extra domains record IDs only. Credentials and message/registry contents never
-- enter the journal; authenticated domain APIs supply authorized data separately.
CREATE OR REPLACE FUNCTION capture_full_sync_hint() RETURNS trigger AS $$
DECLARE row_data JSONB; row_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'users' AND TG_OP = 'UPDATE' THEN
    IF (to_jsonb(OLD) - 'lastLoginAt' - 'updatedAt') = (to_jsonb(NEW) - 'lastLoginAt' - 'updatedAt') THEN RETURN NEW; END IF;
  END IF;
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  row_id := row_data ->> 'id';
  IF row_id IS NULL THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('quran-sync-journal'), 0);
  INSERT INTO sync_changes ("entity", "entityId", "operation", "payload")
  VALUES (TG_TABLE_NAME, row_id, CASE WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPSERT' END,
    jsonb_build_object('id', row_id, 'studentId', row_data->'studentId',
      'circleId', row_data->'circleId', 'userId', row_data->'userId',
      'teacherId', row_data->'teacherId', 'courseId', row_data->'courseId',
      'dutyId', row_data->'dutyId', 'requestId', row_data->'requestId',
      'examId', row_data->'examId'));
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','teacher_profiles','parent_profiles',
    'circle_teachers','circle_memberships','exam_sections','exam_milestone_records',
    'exam_request_sections','exam_sections_on_exams','notifications','course_attendance',
    'preparation_assignments','surah_completions','support_tickets','ticket_messages',
    'conversations','conversation_members','messages','school_settings','registry_users',
    'certificate_templates','media_activities','media_plans','teacher_duties','teacher_duty_assignments']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS full_sync_hint ON %I', table_name);
    EXECUTE format('CREATE TRIGGER full_sync_hint AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION capture_full_sync_hint()', table_name);
  END LOOP;
END $$;

COMMIT;

SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('registry_users','sync_changes','processed_operations','media_plans','teacher_duties','teacher_duty_assignments') ORDER BY tablename;
